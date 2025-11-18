// AirportDriver.cpp
// Cleaned implementation for Project 2 (CSCI 311)
// Implements a simulation of arriving and departing planes

#include <iostream>
#include <vector>
#include <queue>
#include <string>

using namespace std;

class Plane {
public:
	int time;
	int id;
	string status;
	int priority;

	Plane() = default;
	Plane(int t, int i, const string &s, int p) : time(t), id(i), status(s), priority(p) {}

	void print() const {
		cout << time << " " << id << " " << status << " " << priority << '\n';
	}
};

// Min-heap priority queue: smaller priority value is higher precedence.
// If priorities equal, smaller id wins.
class PlanePQ {
	vector<Plane> heap;

	static bool cmp(const Plane &a, const Plane &b) {
		if (a.priority == b.priority) return a.id < b.id;
		return a.priority < b.priority;
	}

	void siftUp(int i) {
		while (i > 0) {
			int p = (i - 1) / 2;
			if (cmp(heap[i], heap[p])) {
				swap(heap[i], heap[p]);
				i = p;
			} else break;
		}
	}

	void siftDown(int i) {
		int n = heap.size();
		while (true) {
			int l = 2 * i + 1;
			int r = 2 * i + 2;
			int smallest = i;
			if (l < n && cmp(heap[l], heap[smallest])) smallest = l;
			if (r < n && cmp(heap[r], heap[smallest])) smallest = r;
			if (smallest != i) {
				swap(heap[i], heap[smallest]);
				i = smallest;
			} else break;
		}
	}

public:
	void push(const Plane &p) { heap.push_back(p); siftUp((int)heap.size() - 1); }
	Plane pull() {
		Plane res = heap.front();
		heap.front() = heap.back();
		heap.pop_back();
		if (!heap.empty()) siftDown(0);
		return res;
	}
	bool empty() const { return heap.empty(); }
	int size() const { return (int)heap.size(); }
};

int main() {
	ios::sync_with_stdio(false);
	cin.tie(nullptr);

	int n;
	if (!(cin >> n)) return 0;

	queue<Plane> arrivals;
	for (int i = 0; i < n; ++i) {
		int t, id, p;
		string s;
		cin >> t >> id >> s >> p;
		arrivals.push(Plane(t, id, s, p));
	}

	PlanePQ arriveH, departH;
	int timestep = 0;
	int processed = 0;

	while (true) {
		// end condition: all planes processed and both queues empty
		if (processed == n && arriveH.empty() && departH.empty()) break;

		// if there are no planes at this timestep and both priority queues empty, advance time
		if (arrivals.empty() == false && arriveH.empty() && departH.empty() && arrivals.front().time > timestep) {
			++timestep;
			continue;
		}

		cout << "Time step " << timestep << '\n';
		cout << "\tEntering simulation" << '\n';

		// enqueue all planes that arrive at this timestep
		while (!arrivals.empty() && arrivals.front().time == timestep) {
			Plane p = arrivals.front();
			arrivals.pop();
			if (p.status == "arriving") arriveH.push(p);
			else departH.push(p);
			cout << "\t\t";
			p.print();
			++processed;
		}

		// Runway assignment logic
		if (!departH.empty() && !arriveH.empty()) {
			cout << "\tRunway A" << '\n';
			cout << "\t\t";
			departH.pull().print();

			cout << "\tRunway B" << '\n';
			cout << "\t\t";
			arriveH.pull().print();
		} else if (!departH.empty() && arriveH.empty()) {
			cout << "\tRunway A" << '\n';
			cout << "\t\t";
			departH.pull().print();
			cout << "\tRunway B" << '\n';
			if (!departH.empty()) {
				cout << "\t\t";
				departH.pull().print();
			}
		} else if (departH.empty() && !arriveH.empty()) {
			if (arriveH.size() > 1) {
				Plane temp = arriveH.pull();
				cout << "\tRunway A" << '\n';
				cout << "\t\t";
				arriveH.pull().print();
				cout << "\tRunway B" << '\n';
				cout << "\t\t";
				temp.print();
			} else {
				cout << "\tRunway A" << '\n';
				cout << "\tRunway B" << '\n';
				if (!arriveH.empty()) {
					cout << "\t\t";
					arriveH.pull().print();
				}
			}
		}

		++timestep;
	}

	return 0;
}
