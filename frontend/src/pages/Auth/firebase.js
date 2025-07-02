// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCn0-BeIQugjCmRAszq3qxwyzMAVhxVZ7Y",
  authDomain: "livecode-45afd.firebaseapp.com",
  projectId: "livecode-45afd",
  storageBucket: "livecode-45afd.firebasestorage.app",
  messagingSenderId: "52805096631",
  appId: "1:52805096631:web:dd475c98032f6101c02932",
  measurementId: "G-Y4RH5TGP25",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const analytics = getAnalytics(app);
