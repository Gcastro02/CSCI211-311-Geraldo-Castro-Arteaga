/***********************************************
************CSCI-311-PROJECT-2-V-2071***********
************************************************
*******CODE-CHECKER-STARTING-ALIGNMENT**********
************************************************
*************CONTROL-NUMBER-XA-72***************
************************************************
**REPORT-GENERATION-MODE-AUTO_SYNC-EXCEPTION-2**
************************************************
*****************DATETIME-SYS*******************
************************************************/

//G1_EXCEPTION: Only produce your code as directed in Section A, B, C, and D1_EXCEPTION.
//G2_EXCEPTION: Do not write anything at the other places in this file.
//D1_EXCEPTION: Put you names here (on this line):Julian Velasquez-Vega

/***********************************************
*************SECTION-A-HEADERS******************
************************************************/
//SECTION_A_START: put your header files here using the include directive.
//G3_EXCEPTION: You can also declare using standard namespace if you like, but do not use any global variable or method.
#include<iostream>
#include<math.h>
#include<vector>
#include<chrono>
#include<cmath>
#include<queue>
#include<stdexcept>

using namespace std;





//SECTION_A_END: Section A ends here. 
/***********************************************
*************SECTION-A-HEADERS-END**************
************************************************/

/***********************************************
*************SECTION-B-CLASSES******************
************************************************/
//SECTION_B_START: put all your classes definitions here.
class Plane{
    public:
    int id;
    int time;
    string status;
    int priority;
    //creates plane by taking in the information
    //and assigning it to proper values
    Plane(int arrivaltime, int ids, string statusPlane, int priorityq){
        id = ids;
        time = arrivaltime;
        status = statusPlane;
        priority = priorityq;
    }
    //to get plane into in main
    void GetPlaneInfo(){
        cout << time << " " << id << " " <<  status << " " << priority << "\n";
    }

};
class PQ{
    private:
    vector<Plane> ary;

    public:
    //check to see which value is of greater priority
    //assigns min to that value
    //then makes sure the min does not equal intial value
    //if it does it swaps the min and i values and calls function again
    void dwheapify(int i){
        int left = 2 * i + 1;
        int right = 2 * i + 2;
        int min = i;
        if((left < ary.size() && checkID(ary[left], ary[min]))){
            min = left;
        }
        if((right < ary.size() && checkID(ary[right], ary[min]))){
            min = right;
        }
        if( min != i){
            swap(ary[min], ary[i]);
            dwheapify(min);
        }
    }
    //looks for partn value if leaf then checks for priority
    //swaps the values i and p and calls function again
    void uwheapify(int i){
        int p = (i-1)/ 2;
        if(p >= 0 && checkID(ary[i], ary[p])){
            swap(ary[i], ary[p]);
            uwheapify(p);
        }
    }

    void remove(int i){
        //if i is last element of vector erase that element
        if ( i == ary.size() - 1){
            ary.erase(ary.begin() + (ary.size() - 1));
        }
        // if i is root, make that root value last element val
        //and erase the last element and call downward heapify
        else if(i == 0){
            ary[0] = ary[ary.size() - 1];
            ary.erase(ary.begin() + (ary.size() - 1));
            dwheapify(i);
        }
        //if i is neither root nore last element
        //that value becomes last element and then call upward and downward
        //heapify on i
        else if(i != 0 && i != ary.size() - 1){
            ary[i] = ary[ary.size() - 1];
            ary.erase(ary.begin() + (ary.size() - 1));
            uwheapify(i);
            dwheapify(i);
        }

    }

    Plane peek(){
        return ary[0];
    }
    //creates object with plane infor of plane
    //at top of vector
    //swaps it with the last value
    //then get rid of last value which is what you return
    //then call downard heapify on the value at front to 
    //go to right poisition
    Plane pull(){
        Plane n = ary[0];
        swap(ary[0], ary[ary.size() - 1]);
        ary.pop_back();
        dwheapify(0);
        return n;
    }

    void push(Plane val){
        ary.push_back(val);
        uwheapify(ary.size() - 1);
    }

    bool Empty(){
        if(ary.empty()){
            return true;
        }
        return false;
    }
    int size(){
        return ary.size();
    }
    //takes in two values of plane
    //two checked in dw and up heapify
    //checks to see if priority is equal
    // if it check id else just return true or false for priorities
    bool checkID(const Plane& one, const Plane& two){
        if(one.priority == two.priority){
            return one.id < two.id;
        }
        return one.priority < two.priority;
    }

};


//SECTION_B_END: Section B ends here. 
/***********************************************
*************SECTION-B-CLASSES-END**************
************************************************/


/***********************************************
*************SECTION-C-MAIN-FUNCTION************
************************************************/
//SECTION_C_START: write your main function here.

int main(){
    PQ arriveH;
    PQ departH;
    queue<Plane> planeq;
    int numOfAir, id, time, priority, timestep, numPlanes;
    string status;
    timestep = 0;
    bool notDone = true;
    numPlanes = 0;
    int count;

    cin >> numOfAir;
    //based on # of airplanes reading in 
    //read into a regular queue to store
    for(int i = 0; i < numOfAir; ++i){
        cin >> time >> id >> status >> priority;
        planeq.push(Plane(time, id, status, priority));
    }  
    //while planes arrive and depart and there are still planes 
    //continue while loop
    while(notDone){
    //checks to make sure the priority queses are empty and the number
    //of planes gone through simulation equals number
    //of planes originally intened. if true bool becomes false to leave loop
    //break loop to not do more work
    if(arriveH.Empty() && departH.Empty() && numOfAir == numPlanes){
        notDone = false;
        break;
    }
    //this checks to make sure that if there is no plane for timestep
    //and the two queues are empty to just increment it
    if((planeq.front().time > timestep) && arriveH.Empty() && departH.Empty()){
        timestep++;
    }

    else{
     cout << "Time step " << timestep << "\n";
     cout << "\t" << "Entering simulation" << "\n";
     //whhile the  queue with the info is not empty
     //and the time for the planes is equal to timestep 
     //added planes to the arrive and depart queue
     //increases the planes having gone through the function
     //and displays info
      while(!(planeq.empty()) && (planeq.front().time == timestep)){
            numPlanes++;
            Plane P = planeq.front();
            if(planeq.empty() == false){
                 planeq.pop();
            }
            if(P.status == "arriving"){
                arriveH.push(P);
          
            }
            else if(P.status == "departing"){
                departH.push(P);

            }
           cout << "\t\t";
           P.GetPlaneInfo();
           count++;
        }
    //checks to make sure neither quese are empty before 
    //computing out airplane information
    if(departH.Empty() == false && arriveH.Empty() == false){
        cout << "\t" << "Runway A\n"; 
        cout << "\t\t";
        departH.pull().GetPlaneInfo(); 

        cout << "\t" << "Runway B\n";
        cout << "\t\t";
        arriveH.pull().GetPlaneInfo();

    }
    //if arrive is empty then both runways take departing planes
    else if(departH.Empty() ==  false && arriveH.Empty() == true){
        cout << "\t" << "Runway A\n"; 
        cout << "\t\t";
        departH.pull().GetPlaneInfo(); 
        cout << "\t" << "Runway B\n";
        if(departH.Empty() == false){
          cout << "\t\t";
          departH.pull().GetPlaneInfo();  
        }
    }
    //if depart is empty then both runways take arriving planes
    else if(departH.Empty() == true && arriveH.Empty() == false){
    //checks to see if more than one plane left in queue
    //since we want to priortize planes
    //we make sure that if two planes are arrviving
    //the priority of the first one goes into
    //runways B that is specfic to arrivials
    //create temp plane that stores that information
        if(arriveH.size() > 1){
            Plane temp = arriveH.pull();
            cout << "\t" << "Runway A\n"; 
            cout << "\t\t";
            arriveH.pull().GetPlaneInfo(); 

            cout << "\t" << "Runway B\n";
            cout << "\t\t";
            temp.GetPlaneInfo();
        }
    //else just compute out the last arrviving plane in runway
    //B
        else{
            cout << "\t" << "Runway A\n"; 
            cout << "\t" << "Runway B\n";
            if(arriveH.Empty() == false){
                cout << "\t\t";
                arriveH.pull().GetPlaneInfo();
            }
        }
    }
    timestep++;
    }
    }
    return 0;
}




//SECTION_C_END: Section C ends here. 
/***********************************************
************SECTION-C-MAIN-FUNCTION-END*********
************************************************/

/***********************************************
**************PLAGIARISM-RTNG-PRTCL-C***********
****************GEN-AI-RTNG-PRTCL-K*************
*********LOOP-CS_SEC-CS_CHR-STU_R_R_RFR*********
*****************DICT-A-ENTRY-2071**************
***************ORI-KTIAN@CSUCHICO.EDU***********
************************************************/

/***********************************************
*********CODE-CHECKER-ENDING-ALIGNMENT**********
************************************************/
