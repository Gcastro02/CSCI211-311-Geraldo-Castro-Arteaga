#include "bst.h"
#include <iostream>
#include <vector>
#include <queue>
#include <string>

using namespace std;

BST::BST() : m_root(nullptr) {}

BST::~BST() {
    clear(m_root);
}

void BST::clear(Node* cur_root) {
    if (cur_root) {
        clear(cur_root->left);
        clear(cur_root->right);
        delete cur_root;
        cur_root = nullptr;
    }
}

bool BST::insert(const string& str) {
    return insert(str, m_root);
}

bool BST::insert(const string& str, Node *&cur_root) {
    if (cur_root == nullptr) {
        cur_root = new Node(str);
        return true;
    }
    if (str < cur_root->data) { 
        return insert(str, cur_root->left);
    } else if (str > cur_root->data) { 
        return insert(str, cur_root->right);
    } else {
        return false; // String already in tree
    }
}

int BST::size() const {
    return size(m_root);
}

int BST::size(Node* cur_root) const {
    if (cur_root == nullptr) {
        return 0;
    }
    return 1 + size(cur_root->left) + size(cur_root->right);
}

bool BST::find(const string& str) const {
    return find(str, m_root);
}

bool BST::find(const string& str, Node* cur_root) const {
    if (cur_root == nullptr) {
        return false;
    }
    if (str < cur_root->data) { 
        return find(str, cur_root->left);
    } else if (str > cur_root->data) { 
        return find(str, cur_root->right);
    } else {
        return true; // String found
    }
}

void BST::print(vector<string> &values) const {
    print(m_root, values);
}

void BST::print(Node* cur_root, vector<string> &values) const {
    if (cur_root) {
        print(cur_root->left, values);
        values.push_back(cur_root->data); 
        print(cur_root->right, values);
    }
}

void BST::breadth(vector<string> &values) const {
    if (m_root == nullptr) {
        return;
    }
    queue<Node*> q;
    q.push(m_root);
    while (!q.empty()) {
        Node* current = q.front();
        q.pop();
        values.push_back(current->data); 
        if (current->left) {
            q.push(current->left);
        }
        if (current->right) {
            q.push(current->right);
        }
    }
}

double BST::distance() const {
    int totalDistance = 0;
    int nodeCount = 0;
    distance(m_root, 0, totalDistance, nodeCount);
    return nodeCount > 0 ? static_cast<double>(totalDistance) / nodeCount : 0.0;
}

void BST::distance(Node* cur_root, int currentDistance, int &totalDistance, int &nodeCount) const {
    if (cur_root) {
        totalDistance += currentDistance;
        nodeCount++;
        distance(cur_root->left, currentDistance + 1, totalDistance, nodeCount);
        distance(cur_root->right, currentDistance + 1, totalDistance, nodeCount);
    }
}

int BST::balanced() const {
    return balanced(m_root);
}

int BST::balanced(Node* cur_root) const {
    if (cur_root == nullptr) {
        return 0; // Height of empty tree
    }
    int leftHeight = balanced(cur_root->left);
    int rightHeight = balanced(cur_root->right);
    if (leftHeight == -1 || rightHeight == -1 || abs(leftHeight - rightHeight) > 1) {
        return -1; // Not balanced
    }
    return 1 + max(leftHeight, rightHeight);
}

void BST::rebalance() {
    vector<string> values;
    print(values);
    clear(m_root);
    m_root = nullptr;
    insert_from_vector(values, 0, values.size() - 1);
}

void BST::insert_from_vector(const vector<string>& values, int start, int end) {
    if (start > end) {
        return;
    }
    int mid = start + (end - start) / 2;
    insert(values[mid]);
    insert_from_vector(values, start, mid - 1);
    insert_from_vector(values, mid + 1, end);
}