# TODO

## App Permissions & Deployment

The hosted version currently shows “Unverified App” warnings from Google when you set it up with your Google Drive permissions. You can still use it (just click through and approve permissions), but it's not ideal if people end up liking it — and might spook some rightfully privacy-concerned users.

If enough people find the tool useful, I’ll go through the Google verification process for the deployed version to clean this up:
- [ ] Set up proper consent screen
- [ ] Write a simple privacy policy
- [ ] Submit it for review (looks like this takes a few weeks)¹

## Share & Get Feedback 

- [ ] Share with friends, journalists, anyone buried in “Untitled” files
- [ ] Ask for honest feedback on how it works and what’s confusing
- [ ] Simple feedback form? Solicit comments on GitHub? 

---

¹ Google OAuth app verification docs: https://developers.google.com/workspace/guides/verification  
² Scopes required: `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/drive.readonly`  