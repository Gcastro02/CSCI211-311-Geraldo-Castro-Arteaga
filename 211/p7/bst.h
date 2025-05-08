#ifndef BST_H
#define BST_H

#include <string>
#include <vector>

class BST {
public:
    BST(); // Constructor
    ~BST(); // Destructor
    bool insert(const std::string &str); // Insert a string into the BST
    int size() const; // Return the number of elements in the BST
    bool find(const std::string &str) const; // Find a string in the BST
    void print(std::vector<std::string> &values) const; // Depth-first traversal
    void breadth(std::vector<std::string> &values) const; // Breadth-first traversal
    double distance() const; // Calculate average distance of nodes from root
    int balanced() const; // Check if the tree is balanced
    void rebalance(); // Rebalance the tree

private:
    struct Node {
        std::string data;
        Node *left;
        Node *right;

        Node(const std::string &str) : data(str), left(nullptr), right(nullptr) {}
    };

    Node *m_root; // Root of the BST
    void clear(Node *node); // Helper function to delete nodes
    bool insert(const std::string &str, Node *&cur_root); // Helper for insert
    int size(Node *cur_root) const; // Helper for size
    bool find(const std::string &str, Node *cur_root) const; // Helper for find
    void print(Node *cur_root, std::vector<std::string> &values) const; // Helper for print
    void distance(Node *cur_root, int currentDistance, int &totalDistance, int &nodeCount) const; // Helper for distance
    int balanced(Node *cur_root) const; // Helper for balanced
    void insert_from_vector(std::vector<std::string> &values); // Helper for rebalance
    void insert_from_vector(const std::vector<std::string>& values, int start, int end); // Helper for rebalance
};

#endif // BST_H