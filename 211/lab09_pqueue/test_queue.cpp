#include "pqueue.h"
#include "cust.h"
#include <iostream>
using namespace std;

int main()
{
  Pqueue q;

  cout << "q contains " << q.length() << " elements." << endl;
  cout << "the priority of the first element == " << q.first_priority() << "." << endl;

  // Create new Cust objects and insert them into the priority queue
  // the integer after new Cust(...) is the priority for this customer
  q.enqueue(new Cust("One", true, 1, 1),1);
  q.enqueue(new Cust("Two", false, 2, 2),2);
  q.enqueue(new Cust("Three", true, 3, 3),3);
  q.enqueue(new Cust("Four", false, 4, 4),4);

  // while the queue is not empty, remove customers and print them
  cout << "removing and printing all elements on the priority queue" << endl;
  cout << "should be ordered One, Two, Three, Four" << endl;
  while (q.empty() == false)
  {
    Cust *cust = q.dequeue();
    cust->print(cout);
    delete cust;
  }
  cout << "q contains " << q.length() << " elements." << endl;

  q.enqueue(new Cust("Three", true, 3, 3),3);
  q.enqueue(new Cust("One", true, 1, 1),1);
  q.enqueue(new Cust("Four", false, 4, 4),4);
  q.enqueue(new Cust("Two", false, 2, 2),2);

  cout << endl;
  cout << "removing and printing all elements on the priority queue" << endl;
  cout << "should be ordered One, Two, Three, Four" << endl;
  while (q.empty() == false)
  {
    Cust *cust = q.dequeue();
    cust->print(cout);
    delete cust;
  }

  cout << "q contains " << q.length() << " elements." << endl;
  q.enqueue(new Cust("Four", false, 4, 4),40);
  cout << "q contains " << q.length() << " elements." << endl;
  cout << "the priority of the first element == " << q.first_priority() << "." << endl;
  q.enqueue(new Cust("Three", true, 3, 3),30);
  cout << "q contains " << q.length() << " elements." << endl;
  cout << "the priority of the first element == " << q.first_priority() << "." << endl;
  q.enqueue(new Cust("Two", false, 2, 2),20);
  cout << "q contains " << q.length() << " elements." << endl;
  cout << "the priority of the first element == " << q.first_priority() << "." << endl;
  q.enqueue(new Cust("One", true, 1, 1),10);
  cout << "q contains " << q.length() << " elements." << endl;
  cout << "the priority of the first element == " << q.first_priority() << "." << endl;


  cout << endl;
  cout << "removing and printing all elements on the priority queue" << endl;
  cout << "should be ordered One, Two, Three, Four" << endl;
  while (q.empty() == false)
  {
    Cust *cust = q.dequeue();
    cust->print(cout);
    delete cust;
  }

  cout << "q contains " << q.length() << " elements." << endl;
  q.enqueue(new Cust("One", true, 1, 1),42);
  q.enqueue(new Cust("Two", false, 2, 2),42);
  q.enqueue(new Cust("Three", true, 3, 3),42);
  q.enqueue(new Cust("Four", false, 4, 4),42);
  cout << "q contains " << q.length() << " elements." << endl;

  cout << endl;
  cout << "removing and printing all elements on the priority queue" << endl;
  cout << "should be ordered One, Two, Three, Four" << endl;
  while (q.empty() == false)
  {
    Cust *cust = q.dequeue();
    cust->print(cout);
    delete cust;
  }
  cout << "q contains " << q.length() << " elements." << endl;

  return 0;
}
