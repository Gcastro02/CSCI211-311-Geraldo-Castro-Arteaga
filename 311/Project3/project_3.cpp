//FILE: project_3.cpp
//PROJECT: CSCI 211 Project 3

//G1_EXCEPTION: Only produce your code as directed in Section A, B, C, and D1_EXCEPTION.
//G2_EXCEPTION: Do not write anything at the other places in this file.
//D1_EXCEPTION: Put you names here (on this line): Geraldo Castro


//SECTION_A_START: put your header files here using the include directive.
//G3_EXCEPTION: You can also declare using standard namespace if you like, but do not use any global variable or method.
#include <iostream>
#include <vector>
#include <queue>
#include <utility>
#include <algorithm>
#include <limits>
#include <functional>
#include <cstdint>
using namespace std;

//SECTION_A_END: Section A ends here. 



//SECTION_B_START: put all your classes definitions here.
// No custom classes required for this simple graph shortest-path implementation.


//SECTION_B_END: Section B ends here. 



//SECTION_C_START: write your main function here.

int main() {
	ios::sync_with_stdio(false);
	cin.tie(nullptr);

	// Input format (inferred):
	// n m initialCharge capacity
	// src dst
	// n lines: id flag (flag==1 means charging station)
	// m lines: u v w (undirected edges with weight w = fuel cost)

	int n, m;
	int capacity, initialCharge;
	if (!(cin >> n >> m >> capacity >> initialCharge)) return 0;

	int src, dst;
	if (!(cin >> src >> dst)) return 0;

	vector<int> nodeFlag(n, 0);
	for (int i = 0; i < n; ++i) {
		int id, flag;
		if (!(cin >> id >> flag)) return 0;
		if (id >= 0 && id < n) nodeFlag[id] = flag;
	}

	vector<vector<pair<int,int>>> adj(n);
	for (int i = 0; i < m; ++i) {
		int u, v, w;
		if (!(cin >> u >> v >> w)) break;
		if (u >= 0 && u < n && v >= 0 && v < n) {
			adj[u].push_back({v, w});
			adj[v].push_back({u, w});
		}
	}

	const long long INF = (1LL<<60);

	struct State {
		int node;
		long long dist;
		int fuel;
		vector<int> path;
	};

	struct Cmp {
		bool operator()(State const &a, State const &b) const {
			if (a.dist != b.dist) return a.dist > b.dist; // smaller dist first
			return a.fuel < b.fuel; // for equal dist prefer more fuel
		}
	};

	priority_queue<State, vector<State>, Cmp> pq;

	vector<long long> bestDist(n, INF);
	vector<int> bestFuel(n, -1);

	// initialize start
	State start;
	start.node = src;
	start.dist = 0;
	start.fuel = initialCharge;
	start.path = {src};
	pq.push(start);
	bestDist[src] = 0;
	bestFuel[src] = initialCharge;

	vector<tuple<long long, vector<int>, long long>> allPaths; // (dist, compressedPath, sumFull)
	long long min_distance = INF;

	while (!pq.empty()) {
		State cur = pq.top(); pq.pop();
		// if this state's dist is worse than known best for this node and fuel, skip
		if (cur.dist > min_distance) break;
		// Note: we don't have per-fuel visited flags, rely on bestDist/bestFuel heuristics

		if (cur.node == dst) {
			// compress path: only keep source, destination, and charging nodes (flag==1)
			vector<int> compressed;
			for (size_t i = 0; i < cur.path.size(); ++i) {
				int nd = cur.path[i];
				if (i == 0 || i + 1 == cur.path.size() || nodeFlag[nd] == 1) {
					compressed.push_back(nd);
				}
			}
			long long sumFull = 0;
			for (int x : cur.path) sumFull += x;
			allPaths.push_back(make_tuple(cur.dist, compressed, sumFull));
			if (cur.dist < min_distance) min_distance = cur.dist;
			continue;
		}

		// expand neighbors
		for (auto &e : adj[cur.node]) {
			int v = e.first;
			int w = e.second;
			if (cur.fuel < w) continue; // not enough fuel to travel

			long long nd = cur.dist + w;
			int nf = cur.fuel - w;
			if (nodeFlag[v] == 1) nf = capacity; // recharge on arrival

			// prune by known bests
			bool shouldPush = false;
			if (bestDist[v] == INF) {
				shouldPush = true;
			} else if (nd < bestDist[v]) {
				shouldPush = true;
			} else if (nf > bestFuel[v]) {
				shouldPush = true;
			}

			if (shouldPush) {
				vector<int> p2 = cur.path;
				p2.push_back(v);
				State nxt{v, nd, nf, p2};
				pq.push(nxt);
				if (nd < bestDist[v]) bestDist[v] = nd;
				if (nf > bestFuel[v]) bestFuel[v] = nf;
			}
		}
	}

	if (allPaths.empty()) {
		cout << "No suitable path from " << src << " to " << dst << " exists\n";
		return 0;
	}

	// choose path with minimal distance and tiebreak by sum of node IDs
	long long bestD = min_distance;
	vector<int> bestPath;
	long long bestSumFull = numeric_limits<long long>::max();
	size_t bestCompSize = numeric_limits<size_t>::max();
	for (auto &pr : allPaths) {
		long long d = get<0>(pr);
		if (d != bestD) continue;
		const vector<int> &comp = get<1>(pr);
		long long sumFull = get<2>(pr);
		size_t compSize = comp.size();
		// prefer fewer compressed nodes (fewer charging stops), then smaller full-path sum
		if (compSize < bestCompSize || (compSize == bestCompSize && sumFull < bestSumFull)) {
			bestCompSize = compSize;
			bestSumFull = sumFull;
			bestPath = comp;
		}
	}

	cout << "Verify Path: 1\n";
	cout << bestD << ": ";
	for (int x : bestPath) cout << x << " ";
	cout << "\n";

	return 0;
}


//SECTION_C_END: Section C ends here. 
