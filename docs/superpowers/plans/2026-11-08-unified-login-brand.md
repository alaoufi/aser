# Aklaat Jdatna unified login and branding

User explicitly authorizes name أكلات جدتنا everywhere, edited logo text, exact SMS phrase رمز التحقق للتسجيل في موقع أكلات جدتنا, and one login entry using username/password with account personality detected server-side.

## Implementation choices delegated to us
- Username OR verified Saudi mobile accepted for password login; custom username optional on password setup (3..40letters/numbers/dot/underscore/hyphen, normalized lowercase NFC, unique). Without custom username, verified phone remains login name. Never infer authority from client account-type input.
- Existing users retain OTP access and can set first/reset password after OTP. Newly verified OTP session gets one-use10minute credentials setup permission. Old sessions/password login cannot reset credentials. Setting credentials rotates session and revokes previous sessions; no default passwords or OTP bypass.
- New signup offers customer/family intent. Family intent opens eligibility application after verification/password setup; only existing eligibility review controls publication/producer role. Existing users route by actual role admin->admin,producer->dashboard,customer->orders. Public registration links consolidate to /login; direct /register remains family application for compatibility.
- Passwords salted Node scrypt, bounded inputs and timing-safe compare/dummy path, username/global rate limits, existing CSRF/body/securitycookie patterns. No external dependencies.
- SMS exact text followed by 4digit code; existing Taqnyat sender/credentials untouched. Never send real SMS for automated tests.
- Preserve original logo and create edited sibling asset. No modifications to other sites or data loss.

## Tasks and ownership
1 Backend agent: migration010 users username/password hash + sessions setup_until; auth.ts OTP text+freshproof session insert; new credentials.ts/passwordlogin and credentials routes; verifyOTP response next optional; session API optionalmetadata ifneeded; lib SessionUser optionalusername only if needed; tests/credentials.test.ts and SMStext test. Tests first, root migrates scratch/prod. No builds/commits/deploy.
2 UI agent: shared.tsx LoginForm unified login/password + OTP signup/recovery + credential setup + accountintent and role destination. PublicAccountShell nav role-aware with useSession (avoid recursive requests if needed) or keep compatibility rootwillreview. loginpage metadata. Own tests/e2e/authentication.spec.ts and adjust account.spec.ts for password default vs OTP. No layout/brand public files or backend.
3 Root: imagegen edit logo, global Arabic brand names/title/SMSrequired backend agent, consolidate header/mobile/footer/home CTA entries /login. Maintain family application. Test changes + review both slices + full scratch test/build/browser sequential then backup/additiveprod migration/deployexactSHA and publicproof. Record docs/commit.

## Gates
- Account type/role cannot be forged via POST. Unknown user/wrong password same401.
- Existing production users get no default credentials and remain able to OTPset.
- Credentials setup needs fresh unexpired OTP-derived session; cannot be reused or called via ordinary login session; rotates oldsessions.
- Username conflicts reported without replacing other identity; setuptransaction rollback retains old credentials on failure.
- Test password reset and role routing, disabledSMS versus workingpassword path, onepublicentry and exact4digit SMS wording via mockedtransport.
- Preserve phoneverification, producerdocumentreview, guestorders, membershippreferences and categorycoverage behaviors.

Status: complete. Backend and UI independently reviewed;80server/DB tests pass, focusedcredentials/SMS10pass after usernamealiasfix, finalauthenticationbrowser10pass afterscopedalertselector; fullotherbrowser54pass+2intentional skips; productionbuildpass. Deployment1a60e1710e65f14bcdd7541dddead135790a56c2 verified live with20page/viewport cases and auth/error/CSRF checks. Before/after encrypted backups restored successfully. Realowner credentials andSMS were not exercised or changed; existingusers can OTPsetupfirstpassword.
