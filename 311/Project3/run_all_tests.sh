#!/bin/bash
# simple test runner for project_3
passed=0
total=0
for f in project_3_tests/*.in; do
  base=$(basename "$f" .in)
  outfile=project_3_tests/${base}.out
  timeout 2s ./project_3 < "$f" > /tmp/project3_out 2>/tmp/project3_err
  rc=$?
  if [ $rc -eq 124 ]; then
    echo "$base: TIMED OUT"
  else
    if [ -f "$outfile" ]; then
      if diff -u "$outfile" /tmp/project3_out > /tmp/project3_diff; then
        echo "$base: PASS"
        passed=$((passed+1))
      else
        echo "$base: FAIL"
        echo '--- expected (first 50 lines)'
        sed -n '1,50p' "$outfile"
        echo '--- got (first 50 lines)'
        sed -n '1,50p' /tmp/project3_out
        echo '--- diff (first 20 lines)'
        sed -n '1,20p' /tmp/project3_diff
      fi
    else
      echo "$base: MISSING expected output file"
    fi
  fi
  total=$((total+1))
done

echo
echo "Summary: Passed $passed of $total tests."