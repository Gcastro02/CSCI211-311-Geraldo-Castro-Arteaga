// CSCI 311 - Spring 2023
// Lab 8 Driver
// Author: Carter Tillquist

#include <iostream>
#include <vector>
#include <string>
#include "Node.h"
#include "Graph.h"
#include <limits.h>
using namespace std;

Graph makeGraph();
void checkIsReachable(Graph &G);
int main(){
  Graph G;

  int operation = -1;
  cin >> operation;

  while (operation > 0){
    switch(operation){
      case 1:
        cout << "MAKE GRAPH" << endl;
        G = makeGraph();
        break;
      case 2:
        cout << "ADJACENCY LIST" << endl;
        G.printAdjList();
        break;
      case 3:
        cout << "IS TWO COLORABLE" << endl;
        cout << (G.isTwoColorable() ? "true" : "false") << endl;
        break;
      case 4:
        cout << "IS CONNECTED" << endl;
        cout << (G.isConnected() ? "true" : "false") << endl;
        break;
      case 5:
        cout << "HAS CYCLE" << endl;
        cout << (G.hasCycle() ? "true" : "false") << endl;
        break;
      case 6:
        cout << "IS REACHABLE" << endl;
        checkIsReachable(G);
        break;
      default:
        break;
    }
    cin >> operation;
  }

  return 0;
}

/*******************************************************************************************************************
 * A function to collect input from the user for making a simple graph. The first line of input should include two *
 * integers, n and m, representing the number of nodes and the number of edges in the graph. The following m lines *
 * each contain a pair of space separated integers representing edges in the graph.                                *
 * return - Graph - a graph constructed based on the user input                                                    *
 * *****************************************************************************************************************/
Graph makeGraph(){
  int n = 0, m = 0;
  cin >> n >> m;
  Graph G;
  for (int i = 0; i < n; i++){
    std::shared_ptr<Node> v(new Node(i));
    G.nodes.push_back(v);
  }
  for (int i = 0; i < m; i++){
    int u = -1, v = -1;
    cin >> u >> v;
    G.nodes[u]->neighbors.push_back(G.nodes[v]);
    G.nodes[v]->neighbors.push_back(G.nodes[u]);
  }
  return G;
}


/****************************************************************************************
 * A function to collect input from the user for checking reachability in a given graph *
 * G - Graph & - a graph in which to check reachability for a set of pairs of nodes     *
 * **************************************************************************************/
void checkIsReachable(Graph &G){
  int num = -1;
  cin >> num;
  for (int i = 0; i < num; i++){
    int u = -1, v = -1;
    cin >> u >> v;
    cout << u << " " << v << " " << (G.isReachable(u, v) ? "True": "False") << endl;
  }
}
