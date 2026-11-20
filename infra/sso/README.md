# CLIMS in the MoH SSO Dashboard

`clims.application.yaml` is the portal import template for launching CLIMS in
its own tab. Fill in the target environment, deployment URL, support URL and
owner details. The URLs and contact in the template are placeholders.

1. Use the MoH identity administration workflow to provision an OpenID Connect
   client with client ID `clims` and client role `clims_access` in the same
   Keycloak realm as the target dashboard.
2. In the dashboard, open **Systems → Import manifest**, review the proposed
   registry entry and import it. Follow the dashboard activation workflow when
   CLIMS is ready for users. Assign the application role to the pilot group.
3. Provision or identify each pilot user's CLIMS account and confirm their
   existing role and facility assignment. Use a verified Keycloak issuer and
   subject from the same realm and the user's existing CLIMS UUID when recording
   the account link.

Migration 000013 establishes the account link. It allows an issuer and subject
to identify exactly one CLIMS user, and a CLIMS user to have one identity per
issuer. The issuer is the exact `iss` value and the subject is the stable
`sub` value. An authorized database operator can provision the link with this
parameterized statement after confirming both identities:

```sql
INSERT INTO user_oidc_identities (issuer, subject, user_id)
VALUES ($1, $2, $3::uuid);
```

The OIDC login callback and browser session handoff are pending. Keep the
launcher in the registration workflow until pilot users can complete sign-in
and CLIMS authorization has been verified with users from different facilities.
