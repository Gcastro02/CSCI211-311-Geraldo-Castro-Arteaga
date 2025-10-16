// Lab 3 - BST_skeleton.cpp - rename it to BST.cpp
// Author: Geraldo Castro
// Lab 3 - BST_skeleton.cpp - rename it to BST.cpp
// Author: Geraldo Castro

#include <iostream>
#include <vector>
#include <limits.h>
#include "BST.h"

// ***do not change the headers***

// Implementations for BST methods

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
  return minimum(root);
}

std::shared_ptr<Node> BST::minimum(std::shared_ptr<Node> n){
  if (!n) return nullptr;
  // go as left as possible
  while (n->left) n = n->left;
  return n;
}

std::shared_ptr<Node> BST::maximum(){
  return maximum(root);
}

std::shared_ptr<Node> BST::maximum(std::shared_ptr<Node> n){
  if (!n) return nullptr;
  // go as right as possible
  while (n->right) n = n->right;
  return n;
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
  root = deleteValue(root, val);
}

std::shared_ptr<Node> BST::deleteValue(std::shared_ptr<Node> n, int val){
  if (!n) return nullptr;

  if (val < n->value){
    n->left = deleteValue(n->left, val);
  } else if (val > n->value){
    n->right = deleteValue(n->right, val);
  } else {
    // found the node to delete
    // case: no child or one child
    if (!n->left){
      std::shared_ptr<Node> r = n->right;
      // decrement size since node removed
      size--;
      return r;
    } else if (!n->right){
      std::shared_ptr<Node> l = n->left;
      size--;
      return l;
    } else {
      // two children: find successor from right subtree (minimum there)
      std::shared_ptr<Node> succ = minimum(n->right);
      // copy successor value into current node
      n->value = succ->value;
      // delete successor node from right subtree
      n->right = deleteValue(n->right, succ->value);
      // size was decremented by the recursive delete; do not decrement here
    }
  }

  return n;
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
  if (!n) return;
  inOrder(n->left, order);
  order.push_back(n);
  inOrder(n->right, order);
}

void BST::postOrder(std::shared_ptr<Node> n, std::vector<std::shared_ptr<Node>> &order){
  if (!n) return;
  postOrder(n->left, order);
  postOrder(n->right, order);
  order.push_back(n);
}

// end of BST.cpp
