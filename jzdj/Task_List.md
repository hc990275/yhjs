# Task: Refactor worker.js to use GitHub Storage

- [x] Backup `worker.js` to `worker_v1.js` <!-- id: 0 -->
- [x] Implement GitHub Storage Logic <!-- id: 1 -->
    - [x] Add GitHub API helper functions (`getSha`, `getContent`, `updateContent`) <!-- id: 2 -->
    - [x] Replace KV `get` with GitHub `fetch` <!-- id: 3 -->
    - [x] Replace KV `put` with GitHub `update` <!-- id: 4 -->
- [x] Remove Deprecated Features <!-- id: 5 -->
    - [x] Remove `env.KV` references <!-- id: 6 -->
    - [x] Remove `/api/ai_clean` and AI UI <!-- id: 7 -->
    - [x] Remove `/sub`, `/tvbox`, `/clash` endpoints <!-- id: 8 -->
- [x] Update Frontend <!-- id: 9 -->
    - [x] Remove AI button and modal from HTML <!-- id: 10 -->
    - [x] Update "Save" logic to use new backend <!-- id: 11 -->
- [x] Feature Documentation <!-- id: 12 -->
    - [x] Update `implementation_plan.md` with final feature list <!-- id: 13 -->
- [x] Create README.md with Env Vars <!-- id: 14 -->
