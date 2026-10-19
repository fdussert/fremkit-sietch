# ShellSmith

## 1.0.0

- Initial release: suggest shell commands through the fixed-host OpenAI or Groq connection, then copy only after a separate explicit action. The widget never executes commands.
- Requires Fremkit core support for the `openai-shellsmith` connection and its `suggestCommand` and `copyCommand` commands; the companion core change is pending release.
