// Project 1
// Author: Geraldo Castro

#include <iostream>
#include <vector>
#include <math.h>
#include <time.h>
#include <chrono>
#include <fstream>
#include <algorithm>
#include <string>
#include <iomanip>
#include <functional>
#include <cctype>

using namespace std;

// Return true if vector is sorted in non-decreasing order
bool is_sorted_non_decreasing(const vector<int>& v) {
    if (v.size() < 2) return true;
    for (size_t i = 1; i < v.size(); ++i) {
        if (v[i] < v[i-1]) return false;
    }
    return true;
}

// Bubble sort for vector<int>
void bubbleSort(vector<int>& a) {
    int n = (int)a.size();
    if (n < 2) return;
    for (int pass = 0; pass < n - 1; ++pass) {
        bool swapped = false;
        for (int i = 0; i < n - 1 - pass; ++i) {
            if (a[i] > a[i+1]) {
                int tmp = a[i]; a[i] = a[i+1]; a[i+1] = tmp;
                swapped = true;
            }
        }
        if (!swapped) break;
    }
}

// Insertion sort for vector<int>
void insertionSort(vector<int>& a) {
    int n = (int)a.size();
    for (int i = 1; i < n; ++i) {
        int key = a[i];
        int j = i - 1;
        while (j >= 0 && a[j] > key) {
            a[j+1] = a[j];
            --j;
        }
        a[j+1] = key;
    }
}

// Selection sort for vector<int>
void selectionSort(vector<int>& a) {
    int n = (int)a.size();
    for (int i = 0; i < n - 1; ++i) {
        int minIdx = i;
        for (int j = i+1; j < n; ++j) {
            if (a[j] < a[minIdx]) minIdx = j;
        }
        if (minIdx != i) {
            int tmp = a[i]; a[i] = a[minIdx]; a[minIdx] = tmp;
        }
    }
}

// Quick sort for vector<int>
int partitionVec(vector<int>& a, int lo, int hi) {
    int pivot = a[hi];
    int i = lo;
    for (int j = lo; j < hi; ++j) {
        if (a[j] <= pivot) {
            int tmp = a[i]; a[i] = a[j]; a[j] = tmp;
            ++i;
        }
    }
    int tmp = a[i]; a[i] = a[hi]; a[hi] = tmp;
    return i;
}

void quickSortRec(vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int p = partitionVec(a, lo, hi);
    quickSortRec(a, lo, p - 1);
    quickSortRec(a, p + 1, hi);
}

void quickSort(vector<int>& a) {
    if (a.size() < 2) return;
    quickSortRec(a, 0, (int)a.size() - 1);
}

vector<int> randomVector(int size, int low, int high) {
    vector<int> v(size, 0);
    for (int i = 0; i < size; i++){
    v[i] = rand() % (high - low +1) + low;
    }

    return v;
}

// Best-case: already sorted ascending
vector<int> bestCaseVector(int size, int low, int high) {
    vector<int> v = randomVector(size, low, high);
    sort(v.begin(), v.end());
    return v;
}

// Worst-case: sorted descending
vector<int> worstCaseVector(int size, int low, int high) {
    vector<int> v = randomVector(size, low, high);
    sort(v.begin(), v.end(), greater<int>());
    return v;
}

string sanitizeName(const string &s) {
    string out;
    for (char c : s) {
        if (isalnum(c)) out.push_back((char)tolower(c));
        else out.push_back('_');
    }
    return out;
}

// Benchmark a sorting function: run it on `trials` random vectors of given `size`
// Collect run times (seconds), verify sorting, and print min/mean/stddev/max
void benchmarkSort(const string &name, void (*sortFunc)(vector<int>&), int trials, int size, int low, int high){
    vector<double> times;
    times.reserve(trials);
    bool all_sorted = true;

    for (int t = 0; t < trials; ++t){
        vector<int> v = randomVector(size, low, high);

        auto start = chrono::high_resolution_clock::now();
        sortFunc(v);
        auto end = chrono::high_resolution_clock::now();

        chrono::duration<double> elapsed = end - start;
        times.push_back(elapsed.count());

        if (!is_sorted_non_decreasing(v)) all_sorted = false;
    }

    // compute stats
    double minv = times[0];
    double maxv = times[0];
    double sum = 0.0;
    for (double x : times){
        if (x < minv) minv = x;
        if (x > maxv) maxv = x;
        sum += x;
    }
    double mean = sum / times.size();
    double sqsum = 0.0;
    for (double x : times) sqsum += (x - mean) * (x - mean);
    double stddev = sqrt(sqsum / times.size());

    // print results
    cout << "************************" << endl;
    cout << name << " on " << trials << " vectors of length " << size << endl;
    cout << (all_sorted ? "Sorting successful" : "Sorting failed") << endl;
    cout << "Minimum: " << minv << " sec; ";
    cout << "Mean: " << mean << " sec; ";
    cout << "Standard deviation: " << stddev << " sec; ";
    cout << "Maximum: " << maxv << " sec" << endl;
    cout << "************************" << endl;
}


int main () {

    srand(time(NULL));

    // Configuration: sizes and trials
    vector<int> sizes = {10, 100, 1000, 5000, 10000};
    const int trialsPerSize = 50; // 50 vectors per size per case
    int low = 0;
    int high = 1000000; // range for random values

    // Algorithms to test (use short names that match sample CSV files)
    vector<pair<string, void(*)(vector<int>&)>> algs = {
        {"bubble", bubbleSort},
        {"insertion", insertionSort},
        {"selection", selectionSort},
        {"quick", quickSort}
    };

    vector<pair<string, function<vector<int>(int,int,int)>>> cases = {
        {"average", [&](int sz,int lo,int hi){ return randomVector(sz,lo,hi); }},
        {"best", [&](int sz,int lo,int hi){ return bestCaseVector(sz,lo,hi); }},
        {"worst", [&](int sz,int lo,int hi){ return worstCaseVector(sz,lo,hi); }}
    };

    // For each algorithm and case, create a CSV file and write times
    // --- Small benchmark requested in assignment: 10 trials, vectors of length 100 ---
    const int smallTrials = 10;
    const int smallSize = 100;
    cout << "\nRunning small benchmark: " << smallTrials << " vectors of length " << smallSize << "\n";
    benchmarkSort("Bubble sort", bubbleSort, smallTrials, smallSize, low, high);
    benchmarkSort("Insertion sort", insertionSort, smallTrials, smallSize, low, high);
    benchmarkSort("Selection sort", selectionSort, smallTrials, smallSize, low, high);
    benchmarkSort("Quick sort", quickSort, smallTrials, smallSize, low, high);
    // --- end small benchmark ---

    // Create one CSV per case (average, best, worst) matching the sample format.
    // Each line: algorithm,size,time (no header). We reuse the same trialsPerSize and sizes.
    for (auto &cs : cases) {
        string caseName = cs.first;
        auto genVec = cs.second;

        string filename;
        if (caseName == "average") filename = "average_case_times.csv";
        else if (caseName == "best") filename = "best_case_times.csv";
        else if (caseName == "worst") filename = "worst_case_times.csv";
        else filename = caseName + "_times.csv";

        ofstream fout(filename);
        if (!fout.is_open()) {
            cerr << "Failed to open output file: " << filename << endl;
            continue;
        }

        cout << "Running case: " << caseName << " -> " << filename << endl;

        // For each algorithm, size, and trial write a line: alg, size, time
        for (auto &alg : algs) {
            string algName = alg.first;
            auto sortFunc = alg.second;

            for (int sz : sizes) {
                for (int t = 0; t < trialsPerSize; ++t) {
                    vector<int> v = genVec(sz, low, high);

                    auto start = chrono::high_resolution_clock::now();
                    sortFunc(v);
                    auto end = chrono::high_resolution_clock::now();

                    chrono::duration<double> elapsed = end - start;
                    double secs = elapsed.count();

                    if (!is_sorted_non_decreasing(v)) {
                        cerr << "Sorting failed for " << algName << " on size " << sz << " case " << caseName << " trial " << t << endl;
                    }

                    // Write time with high precision; use scientific notation to keep small values readable
                    fout << algName << "," << sz << "," << scientific << setprecision(6) << secs << "\n";
                }
            }
        }

        fout.close();
        cout << "Wrote " << filename << endl;
    }

    cout << "All benchmarks completed." << endl;

    return 0;
}