// vlist.h
// Geraldo Castro
// gcasctroarteaga
// The header file for the Vlist class. This class is a linked list of Video objects. It has methods to insert, print, get the length, lookup, and remove videos from the list.

#ifndef VLIST_H
#define VLIST_H

#include "video.h"

class Vlist {
    private:
        struct Node {
            Video* video;
            Node* next;
            Node(Video* v, Node* n) : video(v), next(n) {}
    };
    Node* head;

    public:
        Vlist();
        ~Vlist();
        bool insert(Video* video);
        void print() const;
        int length() const;
        Video* lookup(const std::string& title) const;
        bool remove(const std::string& title);
};

#endif