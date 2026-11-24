# VPS deploy

এখানকার ফাইলগুলো দিয়ে API VPS-এ চালানো হয়। ধাপে ধাপে বাংলা guide আছে API-র মূল README-তে:
[../README.md → "VPS-এ চালু করা"](../README.md#vps-এ-চালু-করা-deployment)

| ফাইল | কাজ |
|---|---|
| `docker-compose.prod.yml` | Postgres, Redis, migration আর API (চাইলে নিজস্ব Nginx-ও) |
| `nginx/host-site.conf` | VPS-এ আগে থেকে Nginx থাকলে তার জন্য API-র config (পথ ক) |
| `nginx/api.conf.template` | নিজস্ব Nginx container-এর config (পথ খ) |
| `.env.production.example` | server-এর `.env`-এর নমুনা (copy করে `.env`) |
| `init-ssl.sh` | নিজস্ব Nginx দিয়ে প্রথমবার চালু আর HTTPS (পথ খ) |
| `backup-db.sh` | প্রতিদিনের DB backup |
