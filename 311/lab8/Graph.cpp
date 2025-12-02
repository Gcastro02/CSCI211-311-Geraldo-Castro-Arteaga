// CSCI 311 
// Graph class cpp
// Author:

#include <iostream>
#include "Graph.h"
#include <queue>
#include <limits.h>

//do not change the header files
//implement the following functions and do not introduce new functions

Graph::Graph(){
}

void Graph::printAdjList(){
  for (size_t i = 0; i < nodes.size(); ++i){
    std::cout << nodes[i]->id << ": ";
    for (auto &nbr : nodes[i]->neighbors){
      std::cout << nbr->id << " ";
    }
    std::cout << std::endl;
  }
}

bool Graph::isNeighbor(int u, int v){
  if (u < 0 || u >= (int)nodes.size()) return false;
  for (auto &nbr : nodes[u]->neighbors){
    if (nbr->id == v) return true;
  }
  return false;
}

void Graph::DFS(){
  // initialize
  for (auto &n : nodes){
    n->visited = false;
    n->discovered = -1;
    n->finished = -1;
    n->predecessor = nullptr;
  }
  int time = 0;
  for (size_t i = 0; i < nodes.size(); ++i){
    if (!nodes[i]->visited){
      time = DFSVisit((int)i, time);
    }
  }
}

int Graph::DFSVisit(int s, int time){
  nodes[s]->visited = true;
  nodes[s]->discovered = ++time;
  for (auto &nbr : nodes[s]->neighbors){
    if (!nbr->visited){
      nbr->predecessor = nodes[s];
      time = DFSVisit(nbr->id, time);
    }
  }
  nodes[s]->finished = ++time;
  return time;
}

void Graph::BFS(int s){
  if (s < 0 || s >= (int)nodes.size()) return;
  // init
  for (auto &n : nodes){
    n->dist = INT_MAX;
    n->predecessor = nullptr;
    n->visited = false;
  }
  std::queue<int> q;
  nodes[s]->dist = 0;
  nodes[s]->visited = true;
  q.push(s);
  while (!q.empty()){
    int u = q.front(); q.pop();
    for (auto &nbr : nodes[u]->neighbors){
      if (!nbr->visited){
        nbr->visited = true;
        nbr->dist = nodes[u]->dist + 1;
        nbr->predecessor = nodes[u];
        q.push(nbr->id);
      }
    }
  }
}

std::vector<int> Graph::distancesFrom(int s){
  std::vector<int> d;
  d.reserve(nodes.size());
  if (s < 0 || s >= (int)nodes.size()){
    for (size_t i = 0; i < nodes.size(); ++i) d.push_back(INT_MAX);
    return d;
  }
  BFS(s);
  for (auto &n : nodes) d.push_back(n->dist);
  return d;
}

bool Graph::isTwoColorable(){
  // use BFS coloring; reset colors
  for (auto &n : nodes){
    n->color = "";
    n->visited = false;
    n->predecessor = nullptr;
  }
  std::queue<int> q;
  for (size_t i = 0; i < nodes.size(); ++i){
    if (nodes[i]->color != "") continue;
    nodes[i]->color = "red";
    nodes[i]->visited = true;
    q.push((int)i);
    while (!q.empty()){
      int u = q.front(); q.pop();
      for (auto &nbr : nodes[u]->neighbors){
        if (nbr->color == ""){
          nbr->color = (nodes[u]->color == "red") ? "blue" : "red";
          nbr->visited = true;
          nbr->predecessor = nodes[u];
          q.push(nbr->id);
        } else if (nbr->color == nodes[u]->color){
          return false;
        }
      }
    }
  }
  return true;
}

bool Graph::isConnected(){
  if (nodes.empty()) return true;
  // run BFS from node 0 and ensure all nodes are reachable
  std::vector<int> d = distancesFrom(0);
  for (auto dist : d){
    if (dist == INT_MAX) return false;
  }
  return true;
}

bool Graph::hasCycle(){
  // reset visited and predecessor
  for (auto &n : nodes){
    n->visited = false;
    n->predecessor = nullptr;
  }
  for (size_t i = 0; i < nodes.size(); ++i){
    if (!nodes[i]->visited){
      nodes[i]->predecessor = nullptr;
      if (hasCycleRecur((int)i)) return true;
    }
  }
  return false;
}

bool Graph::hasCycleRecur(int s){
  nodes[s]->visited = true;
  for (auto &nbr : nodes[s]->neighbors){
    if (!nbr->visited){
      nbr->predecessor = nodes[s];
      if (hasCycleRecur(nbr->id)) return true;
    } else {
      // visited neighbor that is not parent indicates a cycle
      if (nodes[s]->predecessor == nullptr || nbr->id != nodes[s]->predecessor->id){
        return true;
      }
    }
  }
  return false;
}

bool Graph::isReachable(int u, int v){
  if (u < 0 || u >= (int)nodes.size()) return false;
  if (v < 0 || v >= (int)nodes.size()) return false;
  std::vector<int> d = distancesFrom(u);
  return d[v] != INT_MAX;
}