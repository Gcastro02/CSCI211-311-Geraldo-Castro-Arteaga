// CSCI 311 - Spring 2023
// Lab 6 - Hash Table Driver
// Author: Carter Tillquist

#include <iostream>
#include <vector>
#include <memory>
#include "HashTable.h"
using namespace std;


/******************************************
 * Simple main to test Hash Table methods *
 * ****************************************/
int main(){
  unique_ptr<HashTable> H;

  int operation = -1;
  cin >> operation;

  int size = -1, p = -1;
  string s = "";

  while (operation > 0){
    switch(operation){
      case 1: // default constructor
        cout << "DEFAULT CONSTRUCTOR" << endl;
        H = unique_ptr<HashTable>(new HashTable());
        break;
      case 2: // constructor
        cout << "PARAMETERIZED CONSTRUCTOR" << endl;
        cin >> size >> p;
        H = unique_ptr<HashTable>(new HashTable(size, p));
        break;
      case 3: // search
        cin >> s;
        cout << "SEARCH: " << s << ", " << H->search(s) << endl;
        break;
      case 4: // insert
        cin >> s;
        cout << "INSERT: " << s << endl;
        H->insert(s);
        break;
      case 5: // remove
        cin >> s;
        cout << "REMOVE: " << s << endl;
        H->remove(s);
        break;
      case 6: // get size
        cout << "GET SIZE: " << H->getSize() << endl;
        break;
      case 7: // get num elements
        cout << "GET NUM ELEMENTS: " << H->getNumElements() << endl;
        break;
      case 8: // get p
        cout << "GET P: " << H->getP() << endl;
        break;
      case 9: // print hash table
        H->printTable();
        break;
      case 10: // resize table
        cin >> size;
        cout << "RESIZE: " << size << endl;
        H->resize(size);
        break;
      default:
        break;
    }
    cin >> operation;
  }

  return 0;
}

