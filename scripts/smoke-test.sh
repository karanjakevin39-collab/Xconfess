#!/bin/bash
# scripts/smoke-test.sh
# Full-stack smoke test script for xConfess
# Usage: ./scripts/smoke-test.sh [--verbose]
# Comprehensive validation of all critical endpoints

set -e

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
VERBOSE="${1:-}"
RESULTS_FILE="smoke-test-results.txt"
REQUESTS_LOG="smoke-test-requests.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_section() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_test() {
    echo -e "${YELLOW}Testing: $1${NC}"
}

log_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

log_request() {
    echo "[$1] $2" >> "$REQUESTS_LOG"
}

# HTTP test function
test_http_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_code=$3
    local data=$4
    local description=$5
    local headers=${6:-"-H 'Content-Type: application/json'"}

    ((TESTS_RUN++))
    log_test "$description"

    local url="${BACKEND_URL}${endpoint}"
    log_request "$method" "$url"

    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" $headers -d "$data" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" $headers 2>/dev/null)
    fi

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')

    if [ -z "$http_code" ]; then
        log_fail "$description (no response)"
        return 1
    fi

    if [[ "$expected_code" == *"$http_code"* ]]; then
        log_pass "$description (HTTP $http_code)"
        [ -n "$VERBOSE" ] && echo "Response: $body"
        return 0
    else
        log_fail "$description (HTTP $http_code, expected $expected_code)"
        [ -n "$VERBOSE" ] && echo "Response: $body"
        return 1
    fi
}

# Initialize results file
echo "xConfess Smoke Test Results" > "$RESULTS_FILE"
echo "Generated: $(date)" >> "$RESULTS_FILE"
echo "Backend: $BACKEND_URL" >> "$RESULTS_FILE"
echo "Frontend: $FRONTEND_URL" >> "$RESULTS_FILE"
echo "========================================" >> "$RESULTS_FILE"

# Initialize requests log
echo "# xConfess Smoke Test API Requests Log" > "$REQUESTS_LOG"
echo "# Generated: $(date)" >> "$REQUESTS_LOG"
echo "# Format: [METHOD] URL" >> "$REQUESTS_LOG"

echo -e "${GREEN}xConfess Smoke Test Suite${NC}"
echo "Backend: $BACKEND_URL"
echo "Frontend: $FRONTEND_URL"
echo ""

# ============================================================================
# SECTION 1: BACKEND HEALTH CHECKS
# ============================================================================

log_section "SECTION 1: BACKEND HEALTH & READINESS"

test_http_endpoint "GET" "/" "200" "" "Root endpoint (GET /)" "-H 'Content-Type: application/json'"
test_http_endpoint "GET" "/health/live" "200" "" "Liveness probe (GET /health/live)" "-H 'Content-Type: application/json'"
test_http_endpoint "GET" "/health/ready" "200 503" "" "Readiness probe (GET /health/ready)" "-H 'Content-Type: application/json'"

# ============================================================================
# SECTION 2: CONFESSION API ENDPOINTS
# ============================================================================

log_section "SECTION 2: CONFESSION API ENDPOINTS"

test_http_endpoint "GET" "/confessions?page=1&limit=10" "200" "" "List confessions (unauthenticated)" "-H 'Content-Type: application/json'"

# Create a test confession
test_confession_data='{"message":"Test confession from smoke test suite","gender":"female","tags":["test"]}'
test_http_endpoint "POST" "/confessions" "201 400" "$test_confession_data" "Create confession" "-H 'Content-Type: application/json'"

# ============================================================================
# SECTION 3: REPORT ENDPOINT
# ============================================================================

log_section "SECTION 3: REPORT SUBMISSION"

# First, get a confession ID to report
confession_id=$(curl -s "${BACKEND_URL}/confessions?limit=1" | jq -r '.data[0].id // "test-id-123"' 2>/dev/null)
test_report_data="{\"confessionId\":\"${confession_id}\",\"type\":\"offensive\",\"reason\":\"Test report from smoke test\"}"
test_http_endpoint "POST" "/reports" "201 400" "$test_report_data" "Submit report (unauthenticated)" "-H 'Content-Type: application/json'"

# ============================================================================
# SECTION 4: ADMIN ENDPOINTS (SHOULD FAIL UNAUTHENTICATED)
# ============================================================================

log_section "SECTION 4: ADMIN ENDPOINTS (AUTHENTICATION REQUIRED)"

test_http_endpoint "GET" "/diagnostics/notifications" "401 403" "" "Admin diagnostics endpoint without auth (should fail)" "-H 'Content-Type: application/json'"

# ============================================================================
# SECTION 5: FRONTEND HEALTH CHECK
# ============================================================================

log_section "SECTION 5: FRONTEND AVAILABILITY"

((TESTS_RUN++))
log_test "Frontend homepage availability (GET /)"
frontend_response=$(curl -s -w "\n%{http_code}" "${FRONTEND_URL}/" 2>/dev/null)
frontend_code=$(echo "$frontend_response" | tail -n1)
frontend_body=$(echo "$frontend_response" | sed '$d')

if [ "$frontend_code" = "200" ] || [ "$frontend_code" = "404" ]; then
    log_pass "Frontend is responsive (HTTP $frontend_code)"
elif [ -z "$frontend_code" ]; then
    log_fail "Frontend is not responding (connection refused)"
else
    log_fail "Frontend returned HTTP $frontend_code"
fi

# ============================================================================
# RESULTS SUMMARY
# ============================================================================

log_section "TEST RESULTS SUMMARY"

echo "Total Tests Run:    $TESTS_RUN"
echo "Tests Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo "Tests Failed:       ${RED}$TESTS_FAILED${NC}"

pass_rate=$((TESTS_PASSED * 100 / TESTS_RUN))
echo "Pass Rate:          ${YELLOW}${pass_rate}%${NC}"

# Write summary to results file
echo "" >> "$RESULTS_FILE"
echo "Total Tests: $TESTS_RUN" >> "$RESULTS_FILE"
echo "Passed: $TESTS_PASSED" >> "$RESULTS_FILE"
echo "Failed: $TESTS_FAILED" >> "$RESULTS_FILE"
echo "Pass Rate: ${pass_rate}%" >> "$RESULTS_FILE"

# Determine exit code
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "\n${RED}Some tests failed. Review logs for details.${NC}"
    echo "Results saved to: $RESULTS_FILE"
    echo "Requests logged to: $REQUESTS_LOG"
    exit 1
else
    echo -e "\n${GREEN}All tests passed!${NC}"
    echo "Results saved to: $RESULTS_FILE"
    echo "Requests logged to: $REQUESTS_LOG"
    exit 0
fi
  if echo "$content" | grep -qi '<html'; then
    pass_msg "Root route returns HTML"
  else
    fail_msg "Root route did not return HTML"
  fi
else
  fail_msg "Root route — unreachable"
fi

echo ""
echo "============================================"
echo " Results: $pass passed, $fail failed"
echo "============================================"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
