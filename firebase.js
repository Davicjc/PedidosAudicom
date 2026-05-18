const firebaseConfig = {
    apiKey:            "AIzaSyCY3S_3KqP0h_C5w7_b4y6lu4QKjm4SID8",
    authDomain:        "hub-os-c441f.firebaseapp.com",
    projectId:         "hub-os-c441f",
    storageBucket:     "hub-os-c441f.firebasestorage.app",
    messagingSenderId: "174073396645",
    appId:             "1:174073396645:web:fd991e2372d7df46637c4c"
};

// Inicializa o Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

