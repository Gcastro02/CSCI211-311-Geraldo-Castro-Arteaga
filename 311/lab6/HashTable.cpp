// CSCI 311
// Lab 6 - Hash Table cpp
// Author: Geraldo Castro

#include <iostream>
#include <math.h>
#include "HashTable.h"

HashTable::HashTable(){
  // defaults as expected by driver/tests
  size = 11;
  numElements = 0;
  p = 31;
  table = std::vector<std::vector<std::string>>(size);
}

HashTable::HashTable(int s, int mult){
  size = s;
  p = mult;
  numElements = 0;
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
  long long h = 0;
  for (char c : s){
    h = (h * p + static_cast<unsigned char>(c)) % size;
  }
  return static_cast<int>(h);
}