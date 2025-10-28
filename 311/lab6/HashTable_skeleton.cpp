// CSCI 311 - Spring 2023
// Lab 6 - Hash Table cpp
// Author: Carter Tillquist

#include <iostream>
#include <math.h>
#include "HashTable.h"

HashTable::HashTable(){
}

HashTable::HashTable(int s, int mult){
}

int HashTable::getSize(){ return -1; }
int HashTable::getNumElements(){ return -1; }
int HashTable::getP(){ return -1; }

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
  return -1;
}

void HashTable::insert(std::string s){
}

void HashTable::remove(std::string s){
}

void HashTable::resize(int s){
}

int HashTable::hash(std::string s){
  return -1;
}