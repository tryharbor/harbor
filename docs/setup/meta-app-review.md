# Meta App Review (Instagram and Threads)

Self-hosting doesn't need any of this: you connect your own accounts as testers of your own Meta apps ([platform-apps.md](platform-apps.md)). This is for running Harbor for other people, like Harbor Cloud, where people who have no role on the app connect through it.

Until an app passes review, Meta refuses everyone without a role with "Insufficient developer role". Passing review gives the permissions **Advanced Access**, and then the app can go **Live**.

Instagram (Instagram API with Instagram Login) and Threads are separate use cases, usually separate apps, and each is reviewed on its own: two submissions, two sets of screencasts.

## 1. Before you submit

### The business

- [ ] **Business verification.** Connect both apps to a Meta Business portfolio and verify it (Business settings → Security center → Start verification). It needs the legal business name, address and phone number as they appear on an official document (business registration, tax filing, utility bill), plus a domain or email on that domain. Verification takes from a day to a couple of weeks; start it first.
- [ ] **Access verification**, if the dashboard asks for it. Harbor serves other businesses, so Meta may treat it as a tech provider and ask how it handles their data. Answer from the privacy policy.
- [ ] **Data Protection Officer contact**, if Harbor Cloud serves people in the EU.

### App settings (both apps: App settings → Basic)

- [ ] **App icon** (1024 × 1024), **category** (Business and pages, or Productivity), **contact email** `hello@useharbor.io`.
- [ ] **Privacy policy URL:** `https://useharbor.io/privacy`. Check it loads without sign-in and covers what section 4 lists.
- [ ] **Terms of service URL:** `https://useharbor.io/terms`.
- [ ] **App domains:** `useharbor.io`.
- [ ] **User data deletion:** choose **Data deletion callback URL** and enter the platform's data deletion callback below.

### The callbacks (deployed, and tried once)

| | Instagram (Business login settings) | Threads (Threads use case settings) |
|---|---|---|
| Redirect URL | `https://api.useharbor.io/v1/channels/instagram/callback` | `https://api.useharbor.io/v1/channels/threads/callback` |
| Deauthorize / uninstall | `https://api.useharbor.io/v1/channels/instagram/deauthorize` | `https://api.useharbor.io/v1/channels/threads/deauthorize` |
| Data deletion / delete | `https://api.useharbor.io/v1/channels/instagram/data-deletion` | `https://api.useharbor.io/v1/channels/threads/data-deletion` |

- [ ] Deploy the API with the callbacks and set `HARBOR_CONTACT_EMAIL=hello@useharbor.io` on Railway.
- [ ] `curl -X POST https://api.useharbor.io/v1/channels/instagram/data-deletion` answers **400** with "signed_request is missing" (it reached the route), not 401 or 404.
- [ ] **Try it with a tester account.** Connect a tester's Instagram in Harbor, then in Instagram remove Harbor (Settings → Apps and websites, under Website permissions) and check that its channel is gone from Harbor. Do the same on Threads. Then, if Meta offers it, send a data deletion request and open the status page it links to. If a callback answers 400 "signature doesn't match", Meta signed it with a different secret than `INSTAGRAM_APP_SECRET` / `THREADS_APP_SECRET`; look at which one the use case settings show next to the callback fields.

### Something reviewers can see

- [ ] **Reviewer access.** Reviewers need to see the permissions in use. Harbor Cloud's sign-in is GitHub limited to `HARBOR_ALLOWED_GITHUB_USERS`, so a reviewer can't sign in. Either add a reviewer login before submitting (and give its credentials in the submission's testing instructions), or say in the instructions that access is invite-only and the screencasts show the whole flow. Meta rejects submissions it can't verify more often than not, so a reviewer login is the safer choice.
- [ ] **A test Instagram professional account and Threads profile** with a few posts, added as testers, to use in the screencasts. Use real-looking content; no lorem ipsum.
- [ ] The hosted API in `HARBOR_PUBLISH_MODE=live`, so the screencasts show real posts landing on Instagram and Threads.

## 2. Permissions and why Harbor needs each

Ask only for what Harbor's code requests (`packages/providers/src/instagram.ts`, `threads.ts`). Asking for more is a common reason for rejection. Every justification should name the screen where the permission is used.

### Instagram (Instagram API with Instagram Login)

| Permission | Use-case justification |
|---|---|
| `instagram_business_basic` | Harbor shows which Instagram professional account a brand has connected (username, name, profile picture) on the brand's Channels page and next to every post, so the person approving a post knows which account it goes to. Required by the other permissions. |
| `instagram_business_content_publish` | Harbor publishes feed posts, carousels and Reels that the account owner wrote or approved in Harbor's composer and approval inbox, at the time they scheduled. Harbor never publishes anything a person hasn't approved. |
| `instagram_business_manage_insights` | After a post goes out, Harbor reads its views, reach, likes, comments, saves and shares at 1 hour, 6 hours, 24 hours, 3 days and 7 days, and shows them on the post's Performance page, so the owner can compare it with their other posts and learn what works. Only the connected account's own posts. |
| `instagram_business_manage_comments` | Harbor reads comments on the account's own posts and shows them on the post's Performance page, grouped into themes (questions, objections, praise, requests), so the owner sees what their audience asks about and can plan posts that answer it. Harbor doesn't post, hide or delete comments. |

### Threads

| Permission | Use-case justification |
|---|---|
| `threads_basic` | Harbor shows which Threads profile a brand has connected (username, name, picture) on the Channels page and on every post. Required by the other permissions. |
| `threads_content_publish` | Harbor publishes posts the profile owner wrote or approved in Harbor's composer and approval inbox, at the scheduled time. Never anything they haven't approved. |
| `threads_manage_insights` | Harbor reads each post's views, likes, replies, shares and reposts at 1 hour to 7 days and shows them on the Performance page, to compare posts and learn what works. Only the profile's own posts. |
| `threads_read_replies` | Harbor reads replies to the profile's own posts and shows them, grouped into themes, on the post's Performance page. |
| `threads_manage_replies` | When the owner writes a multi-post thread in Harbor (a `---` line starts the next post), Harbor publishes the posts after the first as replies to the owner's own previous post (`reply_to_id`), which is how a thread is made on Threads. Harbor doesn't reply to other people's posts. |

For each permission, Meta also asks whether the data is shared with third parties. The answer is no, except: post text and media go to the platform being published to; if the hosted instance runs a real AI model, brand context and post text go to the model provider to draft posts (say which one, and that it doesn't train on it).

## 3. Screencasts

One screencast per permission, or one recording that covers several with the moments called out in the notes. Record the hosted app (`app.useharbor.io`) in English, at a readable size, with no other tabs or notifications. Start every recording signed out of the platform, so the consent screen shows. Add captions or notes for each step; there's no need for voice.

**Every Instagram screencast starts the same way:** open a brand → **Channels** → **Connect Instagram** → Instagram's login and consent screen listing the permissions → back in Harbor with the account listed (username and picture visible).

| Permission | Show after connecting |
|---|---|
| `instagram_business_basic` | The connected account on the Channels page, then the same account shown on a draft in **Compose**. |
| `instagram_business_content_publish` | **Compose**: write a caption, attach an image from the media library, choose the Instagram account, schedule or send for approval → **Approvals**: approve it → the post shows as published in Harbor → open it on Instagram (in the app or instagram.com) and show it's there. Do it once with a carousel or Reel too if those are part of the review. |
| `instagram_business_manage_insights` | **Performance** → the post just published → its metrics (views, reach, likes, comments, saves, shares) and growth curve. Point out these came from Instagram for this account only. Use a post that's at least a few hours old so the numbers aren't zero. |
| `instagram_business_manage_comments` | Start from **Channels → Reconnect** so the Instagram login and permission screen are on camera. Leave three comments on the post from other accounts → **Performance** → the post → **Fetch replies**: the comments appear by username, grouped into themes. Then **Reply** to one, **Hide** and **Unhide** one, and **Delete** one (it asks to confirm), showing each change on instagram.com. Meta rejected a read-only demo of this permission: it expects to see comments managed. |

**Every Threads screencast starts the same way:** open a brand → **Channels** → **Connect Threads** → Threads consent screen → back in Harbor with the profile listed.

| Permission | Show after connecting |
|---|---|
| `threads_basic` | The profile on the Channels page and on a draft in **Compose**. |
| `threads_content_publish` | **Compose** → a post for Threads → approve → published → open it on threads.com. |
| `threads_manage_replies` | **Compose** → a thread with a `---` line → approve → published → on threads.com, the second post appears as a reply under the first, from the same profile. |
| `threads_manage_insights` | **Performance** → a published Threads post → views, likes, replies, shares, reposts. |
| `threads_read_replies` | Reply to the post from another profile → **Performance** → the post → **Replies**: the reply appears with its theme. |

Close each submission with a short recording of the deletion path, even though Meta doesn't ask for one: **Channels** → **Disconnect**, and the privacy policy's deletion section.

## 4. The privacy policy

`https://useharbor.io/privacy` (`apps/site/app/(legal)/privacy/page.tsx`) already covers most of what Meta checks: what Harbor stores for a connected account, what each Instagram and Threads permission is used for, that platform data isn't sold, shared across workspaces or used to train AI models, and how to delete data. Before submitting, fix these:

1. **It calls itself a draft and says Harbor Cloud isn't open.** Reviewers check that the policy covers the app they're reviewing. Update the Cloud section to describe Cloud as running (or in early access), and drop "This is a draft" from the last section.
2. **Service providers aren't listed** ("We'll list each of them here before Cloud opens"). Name them: Railway (API and media), Vercel (web app), the Postgres host, GitHub (sign-in), and the AI model provider if one is on.
3. **The deletion section doesn't describe Meta's deletion request.** Replace the "Remove Harbor from the platform" bullet with:

   > **Remove Harbor from Instagram or Threads, or ask for deletion there:** in Instagram, go to Settings → Apps and websites (under Website permissions); in Threads, Settings → Account → Website permissions. Remove Harbor, and if offered, send a request to delete your data. When Meta tells us you removed Harbor or asked for deletion, we delete every account record connected to that Instagram or Threads account, its access tokens, and the posts, metrics and replies Harbor stored for it, within minutes. A deletion request gives you a confirmation code and a link where you can check its status. Backups that contain it are overwritten within 30 days. On X or LinkedIn, revoke Harbor in your connected apps; Harbor can no longer use the token.

4. **Retention isn't stated for platform data.** Add to the "Data from the platforms" section:

   > We keep data from a connected account only while it's connected. Disconnecting it, deleting the brand, removing Harbor on the platform, or asking us to delete your data removes it, as described under Deleting your data.

5. Bump the `updated` date.

The terms (`/terms`) already have a section on the platforms; nothing there blocks review.

## 5. Submitting

- [ ] App Review → **Requests** → add each permission, fill in the justification from section 2, attach its screencast, and agree that Harbor will use the data only as described.
- [ ] **Testing instructions:** the reviewer login (or why there isn't one), the test account handles, and the steps from section 3.
- [ ] **Data handling questions:** Harbor is the data controller for Cloud; tokens are encrypted at rest (AES-256-GCM); data is deleted as described in section 4; no data is sold or used for ads.
- [ ] After approval, switch the app to **Live** and connect an account that has no role on the app to confirm "Insufficient developer role" is gone.
- [ ] Repeat for the Threads app.

Meta answers in a few days to a few weeks. A rejection says which permission failed and why; fix that one and resubmit it.
