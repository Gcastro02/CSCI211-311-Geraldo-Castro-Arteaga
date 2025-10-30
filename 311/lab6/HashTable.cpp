// CSCI 311
// Lab 6 - Hash Table cpp
// Author: Geraldo Castro

#include <iostream>
#include <math.h>
#include "HashTable.h"

HashTable::HashTable(){
  size = 11;
  numElements = 0;
  p = 31;
  table = std::vector<std::vector<std::string>>(size);
}

HashTable::HashTable(int s, int mult){
  if (s < 0){
    size = 11; // Use default size if input is negative
  } else {
    size = s; // Otherwise, use the provided size (0 is allowed)
  }
  p = mult;
  numElements = 0;
  // Initialize the table with the size
  table = std::vector<std::vector<std::string>>(size);
}

int HashTable::getSize(){ return size; }
int HashTable::getNumElements(){ return numElements; }
int HashTable::getP(){ return p; }

void HashTable::printTable(){
  std::cout << "HASH TABLE CONTENTS" << std::endl;
  for (int i = 0; i < table.size(); i++){
    if (table[i].size() > 0){
      std::cout << i << ": ";
      for (int j = 0; j < table[i].size()-1; j++){
        std::cout << table[i][j] << ", ";
      }
      std::cout << table[i][table[i].size()-1] << std::endl;
    }
  }
}

int HashTable::search(std::string s){
  if (size <= 0) return -1;
  int idx = hash(s);
  for (int i = 0; i < (int)table[idx].size(); ++i){
    if (table[idx][i] == s) return idx;
  }
  return -1;
}

void HashTable::insert(std::string s){
  if (size <= 0) return;
  int idx = hash(s);
  table[idx].push_back(s);
  numElements++;
}
void HashTable::remove(std::string s){
  if (size <= 0) return;
  int idx = hash(s);
  for (int i = 0; i < (int)table[idx].size(); ++i){
    if (table[idx][i] == s){
      table[idx].erase(table[idx].begin() + i);
      numElements--;
      return;
    }
  }

}

void HashTable::resize(int s){
  if (s <= 0) return;
  // save old contents
  std::vector<std::vector<std::string>> old = table;
  // set new size and clear table
  size = s;
  table = std::vector<std::vector<std::string>>(size);
  // re-insert all elements (preserves insertion order per old buckets)
  int oldNum = numElements;
  numElements = 0;
  for (int i = 0; i < (int)old.size(); ++i){
    for (int j = 0; j < (int)old[i].size(); ++j){
      insert(old[i][j]);
    }
  }
  (void)oldNum; 
}

int HashTable::hash(std::string s){
if (size <= 0) return -1;
// Implement the hash exactly as specified:
// hash(s) = (sigma(s[0]) * p^0 + ... + sigma(s[l-1]) * p^{l-1}) mod m
// where sigma(c) is ASCII value. Use 64-bit unsigned accumulation to
// reduce wrap effects in typical implementations.
unsigned long long h = 0ull;
unsigned long long powp = 1ull;
unsigned long long up = static_cast<unsigned long long>(p);

for (char c : s){
unsigned long long val = static_cast<unsigned char>(c);
// use integer exponentiation by keeping a running powp = p^i
h += val * powp;
// advance powp for the next character: powp *= p
powp *= up;
}

return static_cast<int>(h % static_cast<unsigned long long>(size));
}