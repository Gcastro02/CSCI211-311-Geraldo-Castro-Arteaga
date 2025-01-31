#include <iostream>
#include <vector>

using namespace std;

int main() {
    int num;
    vector<int> numbers;

    while (cin >> num) {
        numbers.push_back(num);
    }

    bool allEven = true;
    for (int n : numbers) {
        if (n % 2 != 0) {
            allEven = false;
            break;
        }
    }

    if (allEven) {
        cout << "all even" << endl;
        return 0;
    } else {
        cerr << "not all even" << endl;
        return 1;
    }
}