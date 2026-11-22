# VPS deploy

এখানকার ফাইলগুলো দিয়ে API VPS-এ চালানো হয়। ধাপে ধাপে বাংলা guide আছে API-র মূল README-তে:
[../README.md → "VPS-এ চালু করা"](../README.md#vps-এ-চালু-করা-deployment)

| ফাইল | কাজ |
|---|---|
| `docker-compose.prod.yml` | Postgres, Redis, migration, API আর Nginx |
| `nginx/api.conf.template` | HTTPS, upload-এর সীমা, Socket.io |
| `.env.production.example` | server-এর `.env`-এর নমুনা (copy করে `.env`) |
| `init-ssl.sh` | প্রথমবার চালু করা আর HTTPS সার্টিফিকেট |
| `backup-db.sh` | প্রতিদিনের DB backup |
