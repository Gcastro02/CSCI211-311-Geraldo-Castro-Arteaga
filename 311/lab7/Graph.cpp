// CSCI 311 lab 7

#include <iostream>
#include "Graph.h"
#include <queue>
#include <limits.h>

//do not change the headers above
//implement the functions below, but do not add new functions


Graph::Graph(){
  nodes = {};
}

void Graph::printAdjList(){
  for (int i = 0; i < nodes.size(); i++){
    std::cout << nodes[i]->id << ": ";
    for (int j = 0; j < nodes[i]->neighbors.size(); j++){
      std::cout << nodes[i]->neighbors[j]->id << " ";
    }
    std::cout << std::endl;
  }
}

bool Graph::isNeighbor(int u, int v){
  if (u < 0 || u >= nodes.size()) return false;
  for (auto &nbr : nodes[u]->neighbors){
    if (nbr->id == v) return true;
  }
  return false;
}

void Graph::DFS(){
  // initialize
  for (int i = 0; i < nodes.size(); i++){
    nodes[i]->visited = false;
    nodes[i]->predecessor = nullptr;
    nodes[i]->discovered = -1;
    nodes[i]->finished = -1;
  }
  int time = 0;
  for (int i = 0; i < nodes.size(); i++){
    if (!nodes[i]->visited){
      time = DFSVisit(i, time);
    }
  }
}

int Graph::DFSVisit(int s, int time){
  // increment time and mark discovered
  time++;
  nodes[s]->discovered = time;
  nodes[s]->visited = true;

  // visit neighbors in order
  for (auto &nbrPtr : nodes[s]->neighbors){
    int v = nbrPtr->id;
    if (!nodes[v]->visited){
      nodes[v]->predecessor = nodes[s];
      time = DFSVisit(v, time);
    }
  }

  // finish node
  time++;
  nodes[s]->finished = time;
  return time;
}

void Graph::BFS(int s){
  // initialize
  for (int i = 0; i < nodes.size(); i++){
    nodes[i]->dist = INT_MAX;
    nodes[i]->predecessor = nullptr;
    nodes[i]->visited = false;
  }
  if (s < 0 || s >= nodes.size()) return;
  std::queue<std::shared_ptr<Node>> q;
  nodes[s]->dist = 0;
  nodes[s]->visited = true;
  q.push(nodes[s]);

  while (!q.empty()){
    auto u = q.front(); q.pop();
    for (auto &nbrPtr : u->neighbors){
      int vid = nbrPtr->id;
      // work with canonical node in nodes vector
      auto v = nodes[vid];
      if (v->dist == INT_MAX){
        v->dist = u->dist + 1;
        v->predecessor = nodes[u->id];
        v->visited = true;
        q.push(v);
      }
    }
  }
}
std::vector<int> Graph::distancesFrom(int s){
  std::vector<int> dists;
  dists.resize(nodes.size(), INT_MAX);
  if (s < 0 || s >= nodes.size()) return dists;
  BFS(s);
  for (int i = 0; i < nodes.size(); i++){
    dists[i] = nodes[i]->dist;
  }
  return dists;
}
