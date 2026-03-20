#!/usr/bin/env bash
set -e

echo "╔════════════════════════════════════╗"
echo "║   HF Hub Desktop — Setup           ║"
echo "╚════════════════════════════════════╝"
echo ""

# Check requirements
command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 not found. Install Python 3.8+ first."; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "ERROR: node not found. Install Node.js 18+ first."; exit 1; }
command -v npm     >/dev/null 2>&1 || { echo "ERROR: npm not found."; exit 1; }

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)

echo "  Python: $PYTHON_VERSION"
echo "  Node:   $(node --version)"
echo ""

# 1. Backend
echo "1. Setting up Python backend..."
cd hf-desktop/backend
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  .venv/Scripts/pip install -r requirements.txt --quiet
else
  .venv/bin/pip install -r requirements.txt --quiet
fi
cd ../..
echo "   ✓ Backend ready"

# 2. Frontend
echo "2. Installing frontend dependencies..."
cd hf-desktop/frontend && npm install --silent && cd ../..
echo "   ✓ Frontend ready"

# 3. Electron
echo "3. Installing Electron dependencies..."
cd hf-desktop && npm install --silent && cd ..
echo "   ✓ Electron ready"

# 4. VS Code extension
echo "4. Building VS Code extension..."
cd hf-vscode && npm install --silent && npm run compile
echo "   ✓ Extension compiled"
cd ..

echo ""
echo "╔════════════════════════════════════╗"
echo "║   Setup complete!                  ║"
echo "╚════════════════════════════════════╝"
echo ""
echo "Desktop app (dev mode):"
echo "  cd hf-desktop && npm run dev"
echo ""
echo "Backend only:"
echo "  cd hf-desktop/backend"
echo "  source .venv/bin/activate   # Windows: .venv\\Scripts\\activate"
echo "  python3 main.py"
echo ""
echo "VS Code extension (.vsix):"
echo "  cd hf-vscode && npm run package"
echo "  code --install-extension hf-hub-vscode-1.0.0.vsix"
