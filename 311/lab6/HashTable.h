// CSCI 311 - Spring 2023
// Lab 6 Hash Table header
// Author: Carter Tillquist

#ifndef HASHTABLE_H
#define HASHTABLE_H

#include <vector>
#include <list>
#include <string>

class HashTable{
  public:
    HashTable();
    HashTable(int, int);

    int search(std::string);
    void insert(std::string);
    void remove(std::string);
    void resize(int);

    int getSize();
    int getNumElements();
    int getP();

    void printTable();

  private:
    int size;
    int numElements;
    int p;
    std::vector<std::vector<std::string>> table;

    int hash(std::string);
};

#endif
