// vlist.cpp
// Geraldo Castro
// gcasctroarteaga
// The implementation file for the Vlist class. This class is a linked list of Video objects. 
// It has methods to insert, print, get the length, lookup, and remove videos from the list.

#include <iostream>
#include "vlist.h"
#include "video.h"

Vlist::Vlist() : head(nullptr) {}

Vlist::~Vlist() {
    Node* current = head;
    while (current != nullptr) {
        Node* next = current->next;
        delete current->video;
        delete current;
        current = next;
    }
}

bool Vlist::insert(Video* video) {
    Node* newNode = new Node{video, nullptr};
    if (head == nullptr || head->video->getTitle() > video->getTitle()) {
        newNode->next = head;
        head = newNode;
        return true;
    } else {
        Node* current = head;
        while (current->next != nullptr && current->next->video->getTitle() < video->getTitle()) {
            current = current->next;
        }
        if (current->next != nullptr && current->next->video->getTitle() == video->getTitle()) {
            return false; // Video with the same title already exists
        }
        newNode->next = current->next;
        current->next = newNode;
        return true;
    }
}

void Vlist::print() const {
    Node* current = head;
    while (current != nullptr) {
        current->video->print();
        current = current->next;
    }
}

int Vlist::length() const {
    int count = 0;
    Node* current = head;
    while (current != nullptr) {
        count++;
        current = current->next;
    }
    return count;
}

Video* Vlist::lookup(const std::string& title) const {
    Node* current = head;
    while (current != nullptr) {
        if (current->video->getTitle() == title) {
            return current->video;
        }
        current = current->next;
    }
    return nullptr;
}

bool Vlist::remove(const std::string& title) {
    if (head == nullptr) return false;

    if (head->video->getTitle() == title) {
        Node* temp = head;
        head = head->next;
        delete temp->video;
        delete temp;
        return true;
    }

    Node* current = head;
    while (current->next != nullptr) {
        if (current->next->video->getTitle() == title) {
            Node* temp = current->next;
            current->next = current->next->next;
            delete temp->video;
            delete temp;
            return true;
        }
        current = current->next;
    }
    return false;
}