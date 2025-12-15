#!/usr/bin/env python3
import subprocess
import os
import sys
import time

# Configuration
API_BASE_URL = "http://localhost:3000"
WS_URL = "ws://localhost:3000/ws"

# Test Matrix
test_cases = [
    {
        "name": "Baseline (4 Players, 1 Concurrent)",
        "args": ["--players", "4", "--concurrency", "1", "--repetitions", "1"]
    },
    {
        "name": "Concurrency (4 Players, 2 Concurrent)",
        "args": ["--players", "4", "--concurrency", "2", "--repetitions", "1"]
    },
    {
        "name": "Bots Basic (4 Players [1 Human + 3 Bots])",
        "args": ["--players", "4", "--concurrency", "1", "--repetitions", "1", "--with-mcts-bots"]
    },
    {
        "name": "Bots Concurrency (4 Players [1 Human + 3 Bots], 2 Concurrent)",
        "args": ["--players", "4", "--concurrency", "2", "--repetitions", "1", "--with-mcts-bots"]
    },
    {
        "name": "Small Game (2 Players)",
        "args": ["--players", "2", "--concurrency", "1", "--repetitions", "1"]
    }
]

def check_health():
    print("Checking server health...")
    for i in range(10):
        try:
            cmd = ["curl", "-s", "-f", f"{API_BASE_URL}/api/health"]
            subprocess.check_call(cmd)
            print("Server is healthy.")
            return True
        except subprocess.CalledProcessError:
            print(f"Server not ready, retrying ({i+1}/10)...")
            time.sleep(2)
    print("Server is NOT healthy after retries.")
    return False

def run_test(test_case):
    print(f"Running test: {test_case['name']}")
    env = os.environ.copy()
    env["API_BASE_URL"] = API_BASE_URL
    env["WS_URL"] = WS_URL
    env["ARTILLERY_RECORD_OUTPUT"] = "true"
    
    # Construct command
    cmd = ["./scripts/run-artillery.sh"] + test_case["args"]
    
    start_time = time.time()
    try:
        # Run the script, allowing output to flow to stdout/stderr
        result = subprocess.run(
            cmd,
            env=env,
            check=False,
            timeout=300 # 5 minutes timeout per test
        )
        duration = time.time() - start_time
        
        success = result.returncode == 0
        
        return {
            "name": test_case["name"],
            "success": success,
            "duration": duration
        }
    except subprocess.TimeoutExpired:
        print("Timeout Expired!")
        return {
            "name": test_case["name"],
            "success": False,
            "duration": time.time() - start_time
        }
    except Exception as e:
        print(f"Exception: {e}")
        return {
            "name": test_case["name"],
            "success": False,
            "duration": time.time() - start_time
        }

def main():
    if not check_health():
        sys.exit(1)

    results = []
    print(f"Starting Load Test Matrix on {API_BASE_URL}")
    print("-" * 50)
    
    for test_case in test_cases:
        result = run_test(test_case)
        results.append(result)
        status = "PASS" if result["success"] else "FAIL"
        print(f"Result: {status} ({result['duration']:.2f}s)")
        print("-" * 50)

    # Summary
    print("\nTest Summary")
    print("=" * 60)
    print(f"{ 'Test Case':<50} | {'Status':<6} | {'Duration':<8}")
    print("-" * 60)
    
    passed = 0
    for res in results:
        status = "PASS" if res["success"] else "FAIL"
        print(f"{res['name']:<50} | {status:<6} | {res['duration']:.2f}s")
        if res["success"]:
            passed += 1
            
    print("=" * 60)
    print(f"Total: {len(results)}, Passed: {passed}, Failed: {len(results) - passed}")
    
    if passed < len(results):
        sys.exit(1)

if __name__ == "__main__":
    main()