import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { db } from "../src/server/db";
import {
  addLibraryPhoto,
  deleteLibraryPhoto,
  listLibrary,
  updateLibraryPhoto,
} from "../src/server/library";
import { saveProduct } from "../src/server/management";
import { productImage } from "../src/server/media";

test(
  "isolated photo library: private per family, family categories only, product picks it, public once published, delete blocked while used",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const env = { ...process.env };
    const originalSend = S3Client.prototype.send;
    const objects = new Map<string, Buffer>();
    Object.assign(process.env, {
      S3_BUCKET: "isolated-test",
      S3_REGION: "test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      PRIVATE_STORAGE_VERIFIED: "true",
      DOCUMENT_ENCRYPTION_KEY:
        process.env.DOCUMENT_ENCRYPTION_KEY ?? randomBytes(32).toString("hex"),
    });
    (S3Client.prototype as any).send = async (command: any) => {
      const key = command.input.Key as string;
      if (command instanceof PutObjectCommand) {
        objects.set(key, Buffer.from(command.input.Body as Uint8Array));
        return {};
      }
      if (command instanceof GetObjectCommand)
        return {
          Body: { transformToByteArray: async () => objects.get(key)! },
        };
      if (command instanceof DeleteObjectCommand) {
        objects.delete(key);
        return {};
      }
      throw new Error("Unexpected storage command");
    };
    const tag = randomUUID().slice(0, 8);
    const mk = (name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "producer" as const,
    });
    const owner = mk("أسرة المكتبة"),
      other = mk("أسرة أخرى");
    const families = [randomUUID(), randomUUID()];
    let productId: string | undefined;
    try {
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      for (const [i, u] of [owner, other].entries()) {
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
          [u.id, u.name, u.phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
          [families[i], u.id, "lib-" + tag + "-" + i, u.name, city, u.phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,'1')",
          [families[i]],
        );
      }
      const png = await sharp({
        create: { width: 40, height: 30, channels: 3, background: "#c99a5b" },
      })
        .png()
        .toBuffer();
      const file = () => new File([png], "dish.png", { type: "image/png" });
      await assert.rejects(
        addLibraryPhoto(owner, file(), { name: "جريش", categoryId: "2" }),
        /أقسام أسرتك/,
      );
      const added = await addLibraryPhoto(owner, file(), {
        name: "جريش بالدجاج",
        description: "صحن جريش",
        categoryId: "1",
      });
      const stored = objects.get("private/photo-library/" + added.id)!;
      assert.ok(stored && !stored.includes(png), "encrypted at rest");
      assert.deepEqual(
        (await listLibrary(owner)).map((p) => [p.name, p.usedBy]),
        [["جريش بالدجاج", 0]],
      );
      assert.equal((await listLibrary(other)).length, 0, "private per family");
      await updateLibraryPhoto(owner, {
        id: added.id,
        name: "جريش أحمر",
        description: "",
        categoryId: null,
      });
      await assert.rejects(
        updateLibraryPhoto(other, { id: added.id, name: "سرقة" }),
        { status: 404 },
      );
      // قبل استخدامه في منتج منشور: خاص بصاحبه.
      assert.ok((await productImage(added.id, owner)).data.length > 0);
      await assert.rejects(productImage(added.id, null), { status: 404 });

      const product = {
        name: "جريش اليوم",
        description: "منتج من صورة المكتبة",
        price: 20,
        unit: "صحن",
        status: "available",
        categoryIds: ["1"],
      };
      await assert.rejects(
        saveProduct(other, { ...product, libraryPhotoId: added.id }, false),
        /مكتبة صورك/,
      );
      productId = (
        await saveProduct(
          owner,
          { ...product, libraryPhotoId: added.id },
          false,
        )
      ).id;
      assert.equal(
        (
          await pool.query(
            "SELECT image_url FROM jdatna.products WHERE id=$1",
            [productId],
          )
        ).rows[0].image_url,
        "/api/media/" + added.id,
      );
      assert.ok((await productImage(added.id, null)).data.length > 0);
      await assert.rejects(deleteLibraryPhoto(owner, { id: added.id }), {
        status: 409,
      });
      await pool.query(
        "UPDATE jdatna.products SET image_url=NULL WHERE id=$1",
        [productId],
      );
      await assert.rejects(deleteLibraryPhoto(other, { id: added.id }), {
        status: 404,
      });
      await deleteLibraryPhoto(owner, { id: added.id });
      assert.equal(objects.has("private/photo-library/" + added.id), false);
      assert.equal((await listLibrary(owner)).length, 0);
    } finally {
      S3Client.prototype.send = originalSend;
      for (const key of Object.keys(process.env))
        if (!(key in env)) delete process.env[key];
      Object.assign(process.env, env);
      if (productId) {
        await pool.query(
          "DELETE FROM jdatna.product_categories WHERE product_id=$1",
          [productId],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          productId,
        ]);
      }
      await pool.query(
        "DELETE FROM jdatna.photo_library WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_categories WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [families],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [owner.id, other.id],
      ]);
      await pool.end();
    }
  },
);
