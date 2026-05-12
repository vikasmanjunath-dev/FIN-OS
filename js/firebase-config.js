// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// Add these to your firebase-config.js
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js";

// Initialize Firestore
const db = getFirestore(app);

// Export db so login.js can use it
export { auth, googleProvider, db, doc, setDoc };
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries





// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAcW_vby5RxIxVQWdUU3EBTaBRebgXMEhE",
  authDomain: "financial-oasis-d04a1.firebaseapp.com",
  projectId: "financial-oasis-d04a1",
  storageBucket: "financial-oasis-d04a1.firebasestorage.app",
  messagingSenderId: "612226391818",
  appId: "1:612226391818:web:7e10ec5d276eb98437e4f3",
  measurementId: "G-96MC5RR4R8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged 
};
