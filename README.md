<div align="center">
  <img src="https://img.icons8.com/?size=100&id=XBTSf3wxOZUm&format=png&color=000000"/>
</div>

# Real-Time Collaborative Markdown Editor

A live, collaborative markdown editor built with a **React/TanStack frontend** and a **Rust-based CRDT backend**, supporting real-time collaboration over WebSockets.

https://livecode-frontend.nathan-smith1922.workers.dev/login

---
## Features

- **Real-time collaboration:** Multiple users can edit the same document simultaneously with changes synced instantly.
- **CRDT-based backend:** Built on Rust to handle concurrent updates without conflicts.
- **Markdown support:** Write and preview Markdown in real time.
- **Frontend stack:** React + TanStack + Vite for a responsive, fast interface.
- **WebSocket integration:** Efficient client-server communication for low-latency updates.

---

## Motivation

I built this project to explore **real-time collaborative systems**, CRDTs, and Rust backends, while also gaining experience with **full-stack integration**. It’s designed to simulate a lightweight Google Docs / Notion-like experience for Markdown documents.

---

## Tech Stack

- **Frontend:** React, TanStack, Vite  
- **Backend:** Rust, CRDT-based document model  
- **Realtime:** WebSockets  
- **Persistence:** PostgreSQL
