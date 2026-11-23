"""
AgentGuard package entrypoint for `python -m agentguard`.
"""

import sys
from agentguard.cli import main

if __name__ == "__main__":
    sys.exit(main())
