
// Lab 5 AVLTree implementation

#include <iostream>
#include <limits.h>
#include "AVLTree.h"
using namespace std;

//do not change anything in the above
//implement the following methods, starting here, do not add new functions

AVLTree::AVLTree(){
  root = nullptr;
  size = 0;
}

std::shared_ptr<AVLNode> AVLTree::getRoot(){
  return root;
}

int AVLTree::getSize(){
  return size;
}

std::shared_ptr<AVLNode> AVLTree::search(int val){
  return search(root, val);
}

std::shared_ptr<AVLNode> AVLTree::search(std::shared_ptr<AVLNode> n, int val){
  if(n == nullptr) return nullptr;
  if(val == n->value) return n;
  if(val < n->value) return search(n->left, val);
  return search(n->right, val);
}

std::shared_ptr<AVLNode> AVLTree::minimum(){
  return minimum(root);
}

std::shared_ptr<AVLNode> AVLTree::minimum(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return nullptr;
  while(n->left != nullptr) n = n->left;
  return n;
}

std::shared_ptr<AVLNode> AVLTree::maximum(){
  return maximum(root);
}

std::shared_ptr<AVLNode> AVLTree::maximum(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return nullptr;
  while(n->right != nullptr) n = n->right;
  return n;
}

int getHeight(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return -1;
  return n->height;
}

int getBalanceFactor(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return 0;
  int lh = getHeight(n->left);
  int rh = getHeight(n->right);
  return lh - rh;
}

void AVLTree::insertValue(int val){
  root = insertValue(root, val);
}

std::shared_ptr<AVLNode> AVLTree::insertValue(std::shared_ptr<AVLNode> n, int val){
  if(n == nullptr){
    auto node = std::make_shared<AVLNode>(val);
    // new node has height 0 as per AVLNode constructor
    size++;
    return node;
  }

  if(val < n->value){
    n->left = insertValue(n->left, val);
  } else if(val > n->value){
    n->right = insertValue(n->right, val);
  } else {
    // duplicate - do nothing
    return n;
  }

  // update height and balance
  int lh = getHeight(n->left);
  int rh = getHeight(n->right);
  n->height = 1 + ((lh>rh)?lh:rh);
  n->balanceFactor = lh - rh;

  return rebalance(n);
}

void AVLTree::deleteValue(int val){
  root = deleteValue(root, val);
}

std::shared_ptr<AVLNode> AVLTree::deleteValue(std::shared_ptr<AVLNode> n, int val){
  if(n == nullptr) return nullptr;

  if(val < n->value){
    n->left = deleteValue(n->left, val);
  } else if(val > n->value){
    n->right = deleteValue(n->right, val);
  } else {
    // found node to delete
    if(n->left == nullptr && n->right == nullptr){
      // no children
      size--;
      return nullptr;
    } else if(n->left == nullptr){
      // one child (right)
      size--;
      return n->right;
    } else if(n->right == nullptr){
      // one child (left)
      size--;
      return n->left;
    } else {
      // two children: replace with successor
      auto succ = minimum(n->right);
      n->value = succ->value;
      n->right = deleteValue(n->right, succ->value);
    }
  }

  // if the subtree became empty
  if(n == nullptr) return n;

  // update height and balance
  int lh = getHeight(n->left);
  int rh = getHeight(n->right);
  n->height = 1 + ((lh>rh)?lh:rh);
  n->balanceFactor = lh - rh;

  return rebalance(n);
}

std::shared_ptr<AVLNode> AVLTree::rebalance(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return n;
  int balance = getBalanceFactor(n);

  // left heavy
  if(balance > 1){
    if(getBalanceFactor(n->left) >= 0){
      // Left Left
      return rotateRight(n);
    } else {
      // Left Right
      return rotateLeftRight(n);
    }
  }

  // right heavy
  if(balance < -1){
    if(getBalanceFactor(n->right) <= 0){
      // Right Right
      return rotateLeft(n);
    } else {
      // Right Left
      return rotateRightLeft(n);
    }
  }

  return n;
}

std::shared_ptr<AVLNode> AVLTree::rotateLeft(std::shared_ptr<AVLNode> n){
  if(n == nullptr || n->right == nullptr) return n;
  auto y = n->right;
  n->right = y->left;
  y->left = n;

  // update heights and balance factors
  int nl = getHeight(n->left);
  int nr = getHeight(n->right);
  n->height = 1 + ((nl>nr)?nl:nr);
  n->balanceFactor = nl - nr;

  int yl = getHeight(y->left);
  int yr = getHeight(y->right);
  y->height = 1 + ((yl>yr)?yl:yr);
  y->balanceFactor = yl - yr;

  return y;
}

std::shared_ptr<AVLNode> AVLTree::rotateRight(std::shared_ptr<AVLNode> n){
  if(n == nullptr || n->left == nullptr) return n;
  auto x = n->left;
  n->left = x->right;
  x->right = n;

  // update heights and balance factors
  int nl = getHeight(n->left);
  int nr = getHeight(n->right);
  n->height = 1 + ((nl>nr)?nl:nr);
  n->balanceFactor = nl - nr;

  int xl = getHeight(x->left);
  int xr = getHeight(x->right);
  x->height = 1 + ((xl>xr)?xl:xr);
  x->balanceFactor = xl - xr;

  return x;
}

std::shared_ptr<AVLNode> AVLTree::rotateLeftRight(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return n;
  n->left = rotateLeft(n->left);
  return rotateRight(n);
}

std::shared_ptr<AVLNode> AVLTree::rotateRightLeft(std::shared_ptr<AVLNode> n){
  if(n == nullptr) return n;
  n->right = rotateRight(n->right);
  return rotateLeft(n);
}

void AVLTree::preOrder(std::shared_ptr<AVLNode> n, vector<std::shared_ptr<AVLNode>> &order){
  if(n == nullptr) return;
  order.push_back(n);
  preOrder(n->left, order);
  preOrder(n->right, order);
}

void AVLTree::inOrder(std::shared_ptr<AVLNode> n, vector<std::shared_ptr<AVLNode>> &order){
  if(n == nullptr) return;
  inOrder(n->left, order);
  order.push_back(n);
  inOrder(n->right, order);
}

void AVLTree::postOrder(std::shared_ptr<AVLNode> n, vector<std::shared_ptr<AVLNode>> &order){
  if(n == nullptr) return;
  postOrder(n->left, order);
  postOrder(n->right, order);
  order.push_back(n);
}

