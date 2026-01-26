#!/bin/bash
echo "=== All ports with 'node' or 'next' ==="
lsof -iTCP -sTCP:LISTEN -n -P | grep -E "node|next" || echo "None found"

echo ""
echo "=== Specific check for ports 3000-3010 ==="
for port in {3000..3010}; do
  pid=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "Port $port: PID $pid - $(ps -p $pid -o comm=)"
  fi
done
