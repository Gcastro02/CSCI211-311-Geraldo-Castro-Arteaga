// Lab 3 - BST_skeleton.cpp - rename it to BST.cpp
// Author: Geraldo Castro

#include<iostream>
#include <vector>
#include <limits.h>
#include "BST.h"

// ***do not change the headers***

// you solutions go here
// remember that you do not need to implement all of them
// follow the document to see which ones you need to implement

BST::BST(){
  root = nullptr;
  size = 0;
}

BST::~BST(){}

std::shared_ptr<Node> BST::search(int target){
  return search(root, target);
}

std::shared_ptr<Node> BST::search(std::shared_ptr<Node> n, int target){
  if (!n) return nullptr;
  if (n->value == target) return n;
  if (target < n->value) return search(n->left, target);
  return search(n->right, target);
}

std::shared_ptr<Node> BST::minimum(){
  return nullptr;
}

std::shared_ptr<Node> BST::minimum(std::shared_ptr<Node> n){
  return nullptr;
}

std::shared_ptr<Node> BST::maximum(){
  return nullptr;
}

std::shared_ptr<Node> BST::maximum(std::shared_ptr<Node> n){
  return nullptr;
}

void BST::insertValue(int val){
  root = insertValue(root, val);
}

std::shared_ptr<Node> BST::insertValue(std::shared_ptr<Node> n, int val){
  // recursive insert: create a new node when we reach a null spot
  if (!n){
    std::shared_ptr<Node> nn(new Node(val));
    // increment tree size
    size++;
    return nn;
  }

  if (val < n->value){
    n->left = insertValue(n->left, val);
  } else if (val > n->value){
    n->right = insertValue(n->right, val);
  } // if equal, do nothing (no duplicates)

  return n;
}

void BST::deleteValue(int val){
}

std::shared_ptr<Node> BST::deleteValue(std::shared_ptr<Node> n, int val){
  return nullptr;
}

bool BST::isBST(std::shared_ptr<Node> n){
  if (!n) return true;
  return isBST(n, INT_MIN, INT_MAX);
}

bool BST::isBST(std::shared_ptr<Node> n, int low, int high){
  if (!n) return true;
  if (n->value <= low || n->value >= high) return false;
  return isBST(n->left, low, n->value) && isBST(n->right, n->value, high);
}

void BST::preOrder(std::shared_ptr<Node> n, std::vector<std::shared_ptr<Node>> &order){
  if (!n) return;
  order.push_back(n);
  preOrder(n->left, order);
  preOrder(n->right, order);
}

void BST::inOrder(std::shared_ptr<Node> n, std::vector<std::shared_ptr<Node>> &order){
}

void BST::postOrder(std::shared_ptr<Node> n, std::vector<std::shared_ptr<Node>> &order){
}
