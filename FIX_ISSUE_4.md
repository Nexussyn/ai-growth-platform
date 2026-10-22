# Fix for #4

I'll start by exploring the repository structure to understand the codebase and find the `runtime-opportunity-scout`.

<tool_call>
<function=Bash>
<parameter=command>
ls -la && echo "---AGENTS.md---" && cat AGENTS.md 2>/dev/null | head -100
</parameter>
<parameter=description>
List repo root and read AGENTS.md
</parameter>
</function>
</tool_call>