// CSCI 311 - Spring 2023
// Lab 3 - BST Driver
// Author: Carter Tillquist

#include <iostream>
#include <memory>
#include <vector>
#include "BST.h"
using namespace std;

void printVector(const vector<std::shared_ptr<Node>> &v);
void runSearch(std::shared_ptr<BST> T);
void runInsert(std::shared_ptr<BST> T);
void runDelete(std::shared_ptr<BST> T);

/**************************************************
 * Simple main to test Binary Search Tree methods *
 * ************************************************/
int main(){
  std::shared_ptr<BST> T(new BST());

  int operation;
  cin >> operation;

  while (operation > 0){
    vector<std::shared_ptr<Node>> order;
    switch(operation){
      case 1: // search
        cout << "SEARCH FOR ";
        runSearch(T);
        break;
      case 2: // insert
        cout << "INSERT ";
        runInsert(T);
        break;
      case 3: // delete
        cout << "DELETE ";
        runDelete(T);
        break;
      case 4: // preorder
        cout << "PREORDER" << endl;
        T->preOrder(T->root, order);
        printVector(order);
        break;
      case 5: // inorder
        cout << "INORDER" << endl;
        T->inOrder(T->root, order);
        printVector(order);
        break;
      case 6: // postorder
        cout << "POSTORDER" << endl;
        T->postOrder(T->root, order);
        printVector(order);
        break;
      case 7: // minimum
        cout << "MINIMUM" << endl;
        cout << T->minimum()->value << endl;
        break;
      case 8: // maximum
        cout << "MAXIMUM" << endl;
        cout << T->maximum()->value << endl; 
        break;
      case 9: // is BST
        cout << "IS BST" << endl;
        cout << T->isBST(T->root) << endl;
        break;
      default:
        break;
    }
    cin >> operation;
  }

  return 0;
}

/*****************************************************************
 * Print the values of nodes in a vector                         *
 * v - const vector<std::shared_ptr<Node>> & - a vector of Nodes *
 * ***************************************************************/
void printVector(const vector<std::shared_ptr<Node>> &v){
  for (int i = 0; i < v.size(); i++){
    cout << v[i]->value << " ";
  }
  cout << endl;
}

/*******************************************************************************************
 * Given a BST, get a value to search for from the console and apply the BST search method *
 * T - std::shared_ptr<BST> - a Binary Search Tree                                         *
 * *****************************************************************************************/
void runSearch(std::shared_ptr<BST> T){
  int target;
  cin >> target;
  cout << target << endl;
  std::shared_ptr<Node> n = T->search(target);
  if (n){ cout << n->value << endl; }
  else{ cout << "Not found" << endl; }
}

/********************************************************************
 * Given a BST, get a value from the console and add it to the tree *
 * T - std::shared_ptr<BST> - a Binary Search Tree                  *
 * ******************************************************************/
void runInsert(std::shared_ptr<BST> T){
  int newVal;
  cin >> newVal;
  cout << newVal << endl;
  T->insertValue(newVal);
}

/**************************************************************************************
 * Given a BST, get a value from the console and remove it from the tree if it exists *
 * T - std::shared_ptr<BST> - a Binary Search Tree                                    *
 * ************************************************************************************/
void runDelete(std::shared_ptr<BST> T){
  int remove;
  cin >> remove;
  cout << remove << endl;
  T->deleteValue(remove);
}