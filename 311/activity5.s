; main.s
; Runs on any Cortex M processor
; see a program run in C and assembly
;
; Author: Place your name here
; Date Created: 
; Date Modified:
; Insert a brief description of your program solution here 
; Lab number and lab partner if applicable 
; list all inputs and outputs here.

; we align 32 bit variables to 32-bits
; we align op codes to 16 bits

;------ DO NOT MODIFY OR REMOVE THIS SECTION ---------------      
	   THUMB
       AREA    DATA, ALIGN=4
	   ALIGN 
;-----------------------------------------------------------

;; Delcare global variables here if needed
   


;;------------ DO NOT MODIFY OR REMOVE THIS SECTION------------
       AREA    |.text|, CODE, READONLY, ALIGN=2
       GET tm4c123gh6pm.s
	   EXPORT  Start
;;------------------------------------------------------------

Start	proc		; DO NOT MODIFY THIS LINE. THIS MARKS THE START OF YOUR ASSEMBLY PROGRAM.

; board initialization here if needed
; insert all pins initilization code here before entering the main endless loop.


loop   
	; main program loop
	; insert your code here
	
	MOV r0, #20 ; a = 20
	MOV r1, #11 ; b = 11
	MOV r2, #5 ; c = 5
	MOV r3, #8 ; d = 8
	
	; e = 4 
	; f = 2
	; g = 7
 	; h = 6
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	

	B   loop		; do not modify or delete this line. 

		

       ALIGN      
       ENDP 
       END 

