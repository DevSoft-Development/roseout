# Lightsail customer hosting rollout

Customer websites are hosted on dedicated AWS Lightsail web nodes, not on Vercel.

Initial production node:

- name: `toh-web-node-01`
- provider: `lightsail`
- region: `us-east-1`
- static IPv4: `34.205.242.37`
- site root: `/srv/sites/<location-id>`
- initial capacity: 20 sites

The main TheOutHaven application remains on Vercel. Customer custom domains must never be attached to the Vercel project.

Domain connection flow:

1. Require an authenticated location owner and an active included domain.
2. Allocate a healthy Lightsail node with fresh health data and available capacity.
3. Configure OpenSRS DNS through the existing signed domain gateway.
4. Point apex `A` to the node static IPv4 and `www` CNAME to the apex domain.
5. Track deployment, DNS, SSL, and overall website status in `business_websites`.
6. Verify HTTPS before marking a website live.

Node health must remain fresh. A node should stop accepting new sites when health is stale or capacity thresholds are exceeded.
