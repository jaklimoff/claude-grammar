# Records docs/demo.gif with vhs (https://github.com/charmbracelet/vhs): `vhs docs/demo.tape` from the repo root.
# The GIF is not committed to main: commit it as demo.gif on the media branch, which the README links to.
# Needs Hack Nerd Font, a logged-in Claude Code, and a small project at ~/my-api (any folder with a server.ts
# that has a /users endpoint will do). Only project settings load, so your status line and other plugins stay out;
# manual mode without Bash keeps permission prompts out of the shot. The native-speaker line shows about one take in three.

Output docs/demo.gif
Set Shell zsh
Set FontFamily "Hack Nerd Font Mono"
Set FontSize 16
Set Width 1240
Set Height 800
Set Padding 16
Set WindowBar Colorful
Set Framerate 20
Set TypingSpeed 35ms

Hide
Type "cd ~/my-api && clear && env -u DEBUG -u CLAUDE_CODE_CHILD_SESSION claude --setting-sources project --strict-mcp-config --plugin-dir ~/Projects/own/claude-grammar --model claude-opus-5-5 --permission-mode default --disallowedTools Bash" Enter
Sleep 6s
# The folder-trust dialog, the first time: pick "Yes, I trust this folder".
Down
Enter
Sleep 10s
Show

Sleep 500ms
Type "explain me in one sentence what is doing the /users endpoint when cache is empty"
Sleep 600ms
Enter
Sleep 8s

Hide
Sleep 20s
Show
Sleep 5s

Hide
Ctrl+C
Ctrl+C
