#include <iostream>

using namespace std;

int main()
{
    int value = 0;

    while(cin >> value) {
        cin >> value;
    }
    
    if(value % 2 == 0){
        cout << "all even" << endl;
        return 1;
    }else{
        cerr << "not all even" << endl;
        return 0;
    }
}