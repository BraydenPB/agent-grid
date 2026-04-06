# Contributing to Agent Grid

Thanks for your interest in contributing! Agent Grid is an open-source project and we welcome contributions of all kinds.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/agent-grid.git`
3. Install dependencies: `npm install`
4. Run the dev server: `npm run tauri dev`

## Development

- **Frontend**: React + TypeScript in `src/`
- **Backend**: Rust in `src-tauri/`
- Tauri dev server hot-reloads the frontend; Rust changes require a restart

## Code Style

- TypeScript everywhere on the frontend
- Use Tailwind for styling — no CSS modules or styled-components
- Keep components small and focused
- Use kebab-case for file names
- Conventional Commits for commit messages: `feat:`, `fix:`, `docs:`, etc.

## Pull Requests

- Create a feature branch: `git checkout -b feat/my-feature`
- Keep PRs focused — one feature or fix per PR
- Include a clear description of what and why
- Make sure `npm run build` passes before submitting

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and version

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
