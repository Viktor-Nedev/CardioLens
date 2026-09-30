---
title: CardioLens
emoji: 🫀
colorFrom: blue
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Explainable coronary artery disease risk mapped onto a 3D heart
---

# CardioLens on Hugging Face Spaces

This file is the Space card. To deploy:

1. Create a new Space with the **Docker** SDK.
2. Push the CardioLens repository to the Space, replacing the root `README.md`
   with this file (Spaces reads its YAML header to find `app_port`).
3. The Space builds the root `Dockerfile` and serves the dashboard and API on port 7860.

Decision support and education only; not a medical device.
