Name: Geraldo Castro
Username: gcastroarteaga
Course/Section: CSCI 211 Section 4

List of Files:
- CORESTICKM159SFRBATL.csv (CPI data)
- UNRATE.csv (Unemployment data)

How to Run:
- Type "make" into the terminal once you're in the right folder with the rest of the files
- Copy and paste "g++ -Wall -pedantic -g -std=c++17 -o eco main.o DataList.o" once the option shows up
- Once compiled, type "./eco" into the terminal to run it

What it does:
- Takes the data from the CPI file and the data from the Unemployment file
- Displays the highest/lowest CPI point in the timeline and the highest/lowest Unemployment rate in the timeline
- Takes both data sets into an algorithm to check if there is a correlation between the data sets

Problem Solving Approach:
- To solve the problem I used a variety of methods
- Primarily used vectors and linked lists/maps to get the data to where I needed it to be
- This facilitated seperating the data and combining it where I needed for different calculations
- To find the correlation itself I first calculated the mean, then the standard deviation, then used that to get the Pearson correlation coefficient to tell me if there is a correlation between the data sets