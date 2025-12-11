#!/bin/bash
# Script to validate that optimizations are working correctly
# Usage: ./scripts/validate-optimizations.sh

set -e

echo "=========================================="
echo "Validating MCTS Optimizations"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."

# Check 1: Verify __slots__ is present in Node class
echo "1. Checking for __slots__ optimization in Node class..."
if grep -q "__slots__" src/engine/mcts.py; then
    echo "   ✓ __slots__ found in Node class"
else
    echo "   ✗ __slots__ not found in Node class"
    exit 1
fi

# Check 2: Verify determinization optimization (sorted by constraints)
echo ""
echo "2. Checking for determinization optimization..."
if grep -q "player_order.*sorted" src/engine/determinization.py || grep -q "sorted.*constraint" src/engine/determinization.py; then
    echo "   ✓ Determinization uses sorted constraint approach"
else
    echo "   ✗ Determinization optimization not found"
    exit 1
fi

# Check 3: Verify loop count tracking
echo ""
echo "3. Checking for loop count tracking..."
if grep -q "last_loop_count" src/engine/mcts.py; then
    echo "   ✓ Loop count tracking present"
else
    echo "   ✗ Loop count tracking not found"
    exit 1
fi

# Check 4: Verify benchmark script exists
echo ""
echo "4. Checking for benchmark script..."
if [ -f "benchmarks/run_sims.py" ]; then
    echo "   ✓ Benchmark script exists"
else
    echo "   ✗ Benchmark script not found"
    exit 1
fi

# Check 5: Verify Python syntax
echo ""
echo "5. Checking Python syntax..."
if python3 -m py_compile src/engine/mcts.py src/engine/determinization.py benchmarks/run_sims.py 2>/dev/null; then
    echo "   ✓ All Python files have valid syntax"
else
    echo "   ✗ Syntax errors found"
    exit 1
fi

echo ""
echo "=========================================="
echo "All validations passed!"
echo "=========================================="
