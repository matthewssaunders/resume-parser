Setup Guide

1. Cloudflare Setup

Create a new Worker in the Cloudflare Dashboard.

Paste the code from worker.js.

In the Worker Settings -> Variables:

Add a variable named SECRET_KEY.

Set the value to a password of your choice (e.g., my-super-secret-key-123).

Click "Encrypt" if available (or just save).

In the Worker Settings -> AI:

Ensure "Workers AI" is enabled/bound to the worker. If you are using the dashboard editor, this is usually automatic, but you may need to add a binding named AI in the wrangler.toml view if you were editing locally.

Dashboard Method: Go to Settings -> Bindings -> Add -> Workers AI -> Name it AI.

2. GitHub / Extension Setup

Ensure your sidepanel.js has the correct:

CLOUDFLARE_WORKER_URL: The URL of your deployed worker.

SECRET_KEY: The same password you set in Cloudflare.

3. Download PDF.js (Crucial Step)

Because Chrome Extensions cannot load scripts from the internet (CDN), you must download two files and upload them to your GitHub repository in the same folder as manifest.json.

Go to: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js

Save this file as pdf.min.js

Go to: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js

Save this file as pdf.worker.min.js

Upload both files to your GitHub repo.

4. Install

Download your repo as a ZIP.

Unzip.

Load unpacked in chrome://extensions.
