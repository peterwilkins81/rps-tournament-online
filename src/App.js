import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, serverTimestamp, deleteDoc } from 'firebase/firestore'; // Added deleteDoc here

// Define a context to make Firebase and user data easily accessible throughout the app
const FirebaseContext = createContext(null);

// Main App Component
const App = () => {
  // State variables for Firebase instances and user data
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [appId, setAppId] = useState(null); // Stores the Firebase App ID

  // Game-specific state variables
  const [currentGameId, setCurrentGameId] = useState(null); // ID of the currently joined game
  const [game, setGame] = useState(null); // Current game data from Firestore
  const [currentPage, setCurrentPage] = useState('home'); // Controls which view is shown (home, create, join, game)

  // --- Firebase Initialization and Authentication ---
  // This useEffect runs once on component mount to initialize Firebase and handle initial authentication.
  useEffect(() => {
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyBni6_iiti4MytyRpfTh95SyC1LhyV9KF0",
        authDomain: "rps-tournament-online.firebaseapp.com",
        projectId: "rps-tournament-online",
        storageBucket: "rps-tournament-online.firebasestorage.app",
        messagingSenderId: "453163680831",
        appId: "1:453163680831:web:cb66974cb075122d5fe48a"
      };

      // Ensure firebaseConfig is valid before proceeding
      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId || !firebaseConfig.apiKey) {
        console.error("Firebase config is missing or invalid. Please ensure all placeholders in App.js are replaced with your actual Firebase project details.");
        return; // Exit early if config is bad
      }

      // Set the appId state variable from the firebaseConfig
      setAppId(firebaseConfig.appId);

      // Initialize Firebase app and services
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      // Store initialized services in state
      setDb(firestore);
      setAuth(firebaseAuth);

      // Listen for authentication state changes (login/logout)
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          console.log("Firebase Auth State Changed: Logged in as", user.uid);
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          console.log("Firebase Auth State Changed: No user, signing in anonymously.");
          try {
            // Sign in anonymously if no user is found. This is common for simple, public apps.
            await signInAnonymously(firebaseAuth);
          } catch (error) {
            console.error("Error signing in anonymously:", error);
          }
        }
      });

      // Cleanup function: unsubscribe from auth listener when component unmounts
      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }, []); // Empty dependency array ensures this useEffect runs only once on mount

  // --- Firestore Game Data Listener ---
  // This useEffect sets up a real-time listener for the current game's data from Firestore.
  // It updates the 'game' state whenever the Firestore document changes.
  useEffect(() => {
    // Only proceed if Firebase is ready, a game is selected, and database is available
    if (!db || !currentGameId || !appId || !isAuthReady) {
      return;
    }

    // Construct the Firestore document reference for the current game
    const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);

    // Set up real-time listener using onSnapshot
    const unsubscribeSnapshot = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const gameData = docSnap.data();
        setGame(gameData); // Update the game state with the latest data
        console.log("Game data updated:", gameData);

        // If game status becomes 'ended', navigate to the home page after a short delay
        if (gameData.status === 'ended') {
          setTimeout(() => {
            setCurrentGameId(null);
            setCurrentPage('gameEnded'); // Or 'home' if you prefer to go straight back
          }, 3000); // Give user time to see final scores/winner
        }

      } else {
        console.log("No such game document!");
        setGame(null); // Clear game state if document doesn't exist
        setCurrentGameId(null); // Clear current game ID
        setCurrentPage('home'); // Go back to home page
      }
    }, (error) => {
      console.error("Error listening to game document:", error);
      // Handle permission errors more gracefully here if needed
      if (error.code === 'permission-denied') {
        alert("You do not have permission to access this game. It might have been deleted or the game code is incorrect.");
        setCurrentGameId(null);
        setCurrentPage('home');
      }
    });

    // Cleanup function: unsubscribe from snapshot listener when component unmounts or dependencies change
    return () => unsubscribeSnapshot();
  }, [db, currentGameId, appId, isAuthReady]); // Dependencies: Re-run when these change

  // --- Round Resolution Logic ---
  // This useEffect watches the 'game' state for changes and resolves rounds when all players have moved.
  useEffect(() => {
    // Only proceed if Firebase is ready, a game is selected, game is started, and game data exists
    if (!db || !currentGameId || !game || game.status !== 'started' || !appId) {
      return;
    }

    const resolveRound = async () => {
      const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);
      // Create a mutable copy of players from the current game state
      const players = { ...game.players };

      // Identify active player IDs (players who have a name)
      const playerIds = Object.keys(players).filter(id => players[id].name);

      // Check if all active players have made a pending choice
      // Ensure all players are accounted for before proceeding
      const allPlayersChosen = playerIds.length === 2 && playerIds.every(id => players[id] && players[id].pendingChoice);


      // Only proceed if all players have made a pending choice
      if (allPlayersChosen) {
        console.log("All players have made their choices. Resolving round...");

        // Assign player 1 and player 2 based on the order of playerIds
        // Assuming 2 players for a standard game
        let p1Id = playerIds[0];
        let p2Id = playerIds[1];

        let p1Choice = players[p1Id]?.pendingChoice;
        let p2Choice = players[p2Id]?.pendingChoice;

        let roundWinnerId = null;
        let newScores = { ...game.scores }; // Copy current scores
        let newHistory = [...(game.history || [])]; // Copy current history

        // Only determine winner if both choices are present
        if (p1Choice && p2Choice) {
          const result = determineWinner(p1Choice, p2Choice); // Use the helper function

          if (result === 'player1') {
            roundWinnerId = p1Id;
            newScores[p1Id] = (newScores[p1Id] || 0) + 1; // Increment p1's score
            console.log(`${players[p1Id].name} wins the round!`);
          } else if (result === 'player2') {
            roundWinnerId = p2Id;
            newScores[p2Id] = (newScores[p2Id] || 0) + 1; // Increment p2's score
            console.log(`${players[p2Id].name} wins the round!`);
          } else {
            console.log("It's a tie!");
          }

          // Reveal choices by moving from pendingChoice to choice, and clear pendingChoice
          players[p1Id].choice = p1Choice;
          players[p2Id].choice = p2Choice;
          players[p1Id].pendingChoice = null;
          players[p2Id].pendingChoice = null;

          // Record this round's details in the game history
          newHistory.push({
            round: game.currentRound,
            players: {
              [p1Id]: { name: players[p1Id].name, choice: p1Choice },
              [p2Id]: { name: players[p2Id].name, choice: p2Choice }
            },
            winner: roundWinnerId ? players[roundWinnerId].name : 'Tie',
            scores: { ...newScores } // Record scores at the end of this round
          });

        } else {
          console.warn("One or more players did not make a choice for this round. Not resolving.");
          return; // Don't proceed with resolving if choices are missing
        }

        let newCurrentRound = game.currentRound + 1;
        let newStatus = game.status;
        let finalWinnerId = null; // To store the tournament winner

        // Check if the game has reached its total number of rounds
        if (newCurrentRound > game.rounds) {
          newStatus = 'ended';
          // Logic to determine the overall tournament winner
          const finalScores = newScores;
          const scoresArray = Object.entries(finalScores).sort(([, scoreA], [, scoreB]) => scoreB - scoreA); // Sort players by score

          if (scoresArray.length > 0 && scoresArray[0][1] > (scoresArray[1]?.[1] || -1)) {
            finalWinnerId = scoresArray[0][0]; // Player with the uniquely highest score
          } else if (scoresArray.length > 1 && scoresArray[0][1] === scoresArray[1][1]) {
              finalWinnerId = 'Tie'; // Top scores are equal, so it's a tie
          }
          console.log("Game has ended. Final winner:", finalWinnerId ? players[finalWinnerId].name : "None");
        }

        try {
          // Update the Firestore document with the new game state
          await updateDoc(gameDocRef, {
            players: players, // Updated players with revealed choices and cleared pending moves
            scores: newScores,
            history: newHistory,
            currentRound: newCurrentRound,
            status: newStatus,
            winner: finalWinnerId, // Set the overall game winner if applicable
            lastUpdated: serverTimestamp(),
          });

          console.log(`Round ${game.currentRound} resolved. Next round: ${newCurrentRound}`);

        } catch (error) {
          console.error("Error resolving round:", error);
        }
      }
    };

    // Helper to determine round winner based on Rock, Paper, Scissors rules
    const determineWinner = (choice1, choice2) => {
      if (choice1 === choice2) return 'tie'; // If choices are the same, it's a tie
      if (
        (choice1 === 'rock' && choice2 === 'scissors') || // Rock beats Scissors
        (choice1 === 'paper' && choice2 === 'rock') ||    // Paper beats Rock
        (choice1 === 'scissors' && choice2 === 'paper')   // Scissors beats Paper
      ) {
        return 'player1'; // First player wins
      }
      return 'player2'; // Second player wins
    };

    // Trigger resolveRound if the game object has players and pending choices are made
    // This will run when 'game' object updates from Firebase
    if (Object.keys(game.players || {}).length > 0 && Object.values(game.players).some(p => p.pendingChoice)) {
       resolveRound();
    }

  }, [game, db, currentGameId, userId, appId]); // Dependencies: Re-run when these values change

  // --- Helper Functions ---

  // Generates a unique 6-character alphanumeric game code
  const generateGameCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // Handles creating a new game
  const createGame = async (gameName, rounds) => {
    if (!db || !userId || !displayName || !appId) {
      console.error("Firebase DB, User ID, Display Name, or App ID not available.");
      return;
    }
    const gameCode = generateGameCode();
    const newGameRef = doc(db, `artifacts/${appId}/public/data/games`, gameCode);

    try {
      await setDoc(newGameRef, {
        name: gameName,
        rounds: parseInt(rounds, 10), // Ensure rounds is a number
        currentRound: 1,
        status: 'waiting', // waiting, started, ended
        players: {
          [userId]: { name: displayName, score: 0, host: true, choice: null, pendingChoice: null }
        },
        scores: {
          [userId]: 0
        },
        history: [], // Stores round-by-round results
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
      setCurrentGameId(gameCode);
      setCurrentPage('lobby');
      console.log("Game created with code:", gameCode);
    } catch (error) {
      console.error("Error creating game:", error);
      alert("Failed to create game: " + error.message);
    }
  };

  // Handles joining an existing game
  const joinGame = async (gameCode) => {
    if (!db || !userId || !displayName || !appId) {
      console.error("Firebase DB, User ID, Display Name, or App ID not available.");
      return;
    }
    const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, gameCode);

    try {
      const docSnap = await getDoc(gameDocRef);
      if (docSnap.exists()) {
        const gameData = docSnap.data();
        if (Object.keys(gameData.players).length < 2 && !gameData.players[userId]) {
          // Add player to existing game
          const updatedPlayers = {
            ...gameData.players,
            [userId]: { name: displayName, score: 0, host: false, choice: null, pendingChoice: null }
          };
          const updatedScores = {
            ...gameData.scores,
            [userId]: 0
          };

          await updateDoc(gameDocRef, {
            players: updatedPlayers,
            scores: updatedScores,
            lastUpdated: serverTimestamp(),
          });
          setCurrentGameId(gameCode);
          setCurrentPage('lobby');
          console.log("Joined game:", gameCode);
        } else if (gameData.players[userId]) {
          // Player is already in the game
          setCurrentGameId(gameCode);
          setCurrentPage('lobby'); // Or direct to game if started
          console.log("Already in game:", gameCode);
        } else {
          alert("Game is full!");
        }
      } else {
        alert("Game not found!");
      }
    } catch (error) {
      console.error("Error joining game:", error);
      alert("Failed to join game: " + error.message);
    }
  };

  // Handles starting the game (only host can do this)
  const handleStartGame = async () => {
    if (!db || !currentGameId || !userId || !game || game.players[userId]?.host !== true) {
      console.warn("Cannot start game: Not host or game not ready.");
      return;
    }
    if (Object.keys(game.players).length < 2) {
        alert("Need at least 2 players to start the game.");
        return;
    }

    const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);
    try {
      await updateDoc(gameDocRef, {
        status: 'started',
        lastUpdated: serverTimestamp(),
      });
      console.log("Game started!");
      setCurrentPage('game');
    } catch (error) {
      console.error("Error starting game:", error);
      alert("Failed to start game: " + error.message);
    }
  };

  // Handles a player making a move (rock, paper, or scissors)
  const handlemakemove = async (move) => {
    if (!db || !currentGameId || !userId || !game || game.status !== 'started' || game.currentRound > game.rounds) {
      console.warn("Cannot make move: Game not ready or not started.");
      return;
    }

    const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);
    const players = { ...game.players };

    // Store choice as pending for the current user
    if (players[userId]) {
      players[userId].pendingChoice = move;
    }

    try {
      await updateDoc(gameDocRef, {
        players: players,
        lastUpdated: serverTimestamp(),
      });
      console.log(`Player ${userId} made a pending move: ${move}`);
    } catch (error) {
      console.error("Error making move:", error);
    }
  };

  // Handles a player leaving the game
  const handleLeaveGame = async () => {
    if (!db || !currentGameId || !userId || !appId) {
      console.warn("Cannot leave game: DB, game ID, or user ID not available.");
      return;
    }

    const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);

    try {
      const docSnap = await getDoc(gameDocRef);
      if (docSnap.exists()) {
        const gameData = docSnap.data();
        const updatedPlayers = { ...gameData.players };
        const updatedScores = { ...gameData.scores };

        // Remove player from players object
        delete updatedPlayers[userId];
        delete updatedScores[userId];

        if (Object.keys(updatedPlayers).length === 0) {
          // If no players left, delete the game document
          await deleteDoc(gameDocRef);
          console.log("Game deleted as all players left.");
        } else {
          // If other players remain, update the game document
          await updateDoc(gameDocRef, {
            players: updatedPlayers,
            scores: updatedScores,
            lastUpdated: serverTimestamp(),
          });
          console.log(`Player ${userId} left game ${currentGameId}`);
        }
      } else {
        console.log("Game document not found when trying to leave.");
      }
    } catch (error) {
      console.error("Error leaving game:", error);
      alert("Failed to leave game: " + error.message);
    } finally {
      setCurrentGameId(null);
      setGame(null);
      setCurrentPage('home');
    }
  };

  // Handles restarting the game (resetting state for a new tournament)
  const handleRestartGame = async () => {
    if (!db || !currentGameId || !userId || !appId || !game || game.players[userId]?.host !== true) {
      console.warn("Cannot restart game: Not host or game not ready.");
      return;
    }

    const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);
    const initialPlayersState = {};
    Object.keys(game.players).forEach(pId => {
      initialPlayersState[pId] = {
        ...game.players[pId],
        score: 0,
        choice: null,
        pendingChoice: null,
      };
    });

    try {
      await updateDoc(gameDocRef, {
        currentRound: 1,
        status: 'waiting',
        players: initialPlayersState,
        scores: Object.keys(game.players).reduce((acc, pId) => ({ ...acc, [pId]: 0 }), {}),
        history: [],
        winner: null,
        lastUpdated: serverTimestamp(),
      });
      setCurrentPage('lobby'); // Go back to lobby to restart
      console.log("Game restarted.");
    } catch (error) {
      console.error("Error restarting game:", error);
      alert("Failed to restart game: " + error.message);
    }
  };

  // --- UI Components ---

  // Home Page Component
  const HomePage = ({ onShowCreateGame, onShowJoinGame, userId }) => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <h1 className="text-4xl font-bold mb-4 text-green-400">Rock, Paper, Scissors Tournament</h1>
        <p className="text-lg mb-8">Challenge your friends to an epic tournament!</p>
        <div className="space-y-4">
          <button
            onClick={onShowCreateGame}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
          >
            Create New Game
          </button>
          <button
            onClick={onShowJoinGame}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
          >
            Join Existing Game
          </button>
        </div>
        <p className="mt-8 text-sm text-gray-500">Your Session ID: {userId || 'Loading...'}</p>
      </div>
    </div>
  );

  // Create Game Component
  const CreateGame = ({ onCreateGame, onBack }) => {
    const [gameName, setGameName] = useState('');
    const [rounds, setRounds] = useState(3);

    const handleSubmit = (e) => {
      e.preventDefault();
      if (gameName.trim() && rounds > 0) {
        onCreateGame(gameName, rounds);
      } else {
        alert("Please enter a game name and a valid number of rounds.");
      }
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full">
          <h2 className="text-3xl font-bold mb-6 text-center text-blue-400">Create New Game</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="gameName" className="block text-lg font-medium text-gray-300 mb-2">Game Name:</label>
              <input
                type="text"
                id="gameName"
                className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="rounds" className="block text-lg font-medium text-gray-300 mb-2">Number of Rounds:</label>
              <input
                type="number"
                id="rounds"
                className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                value={rounds}
                onChange={(e) => setRounds(Math.max(1, parseInt(e.target.value, 10) || 1))}
                min="1"
                required
              />
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
              >
                Create Game
              </button>
              <button
                type="button"
                onClick={onBack}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
              >
                Back
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Join Game Component
  const JoinGame = ({ onJoinGame, onBack }) => {
    const [gameCode, setGameCode] = useState('');

    const handleSubmit = (e) => {
      e.preventDefault();
      if (gameCode.trim()) {
        onJoinGame(gameCode.toUpperCase()); // Ensure code is uppercase
      } else {
        alert("Please enter a game code.");
      }
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full">
          <h2 className="text-3xl font-bold mb-6 text-center text-green-400">Join Existing Game</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="gameCode" className="block text-lg font-medium text-gray-300 mb-2">Game Code:</label>
              <input
                type="text"
                id="gameCode"
                className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-green-500 focus:border-green-500 uppercase"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value)}
                maxLength="6"
                required
              />
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
              >
                Join Game
              </button>
              <button
                type="button"
                onClick={onBack}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
              >
                Back
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Game Lobby Component
  const GameLobby = ({ game, currentGameId, userId, onStartGame, onLeaveGame }) => {
    const isHost = game?.players[userId]?.host;
    const playerNames = Object.values(game?.players || {}).map(p => p.name).join(', ');

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-2xl w-full text-center">
          <h2 className="text-3xl font-bold mb-4 text-purple-400">Game Lobby: {game?.name || 'Loading...'}</h2>
          <p className="text-lg mb-2">Game Code: <span className="font-mono text-xl text-yellow-400">{currentGameId}</span></p>
          <p className="text-md mb-4">Rounds: {game?.rounds}</p>

          <div className="mb-6">
            <h3 className="text-2xl font-semibold mb-2 text-gray-300">Players:</h3>
            <ul className="list-disc list-inside text-left mx-auto max-w-sm">
              {Object.entries(game?.players || {}).map(([id, player]) => (
                <li key={id} className="text-lg">
                  {player.name} {id === userId ? '(You)' : ''} {player.host ? '(Host)' : ''}
                </li>
              ))}
            </ul>
          </div>

          {isHost && Object.keys(game?.players || {}).length >= 2 && (
            <button
              onClick={onStartGame}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105 mb-4"
            >
              Start Game
            </button>
          )}
          {isHost && Object.keys(game?.players || {}).length < 2 && (
            <p className="text-yellow-400 mb-4">Waiting for more players to join (Need 2+ to start)</p>
          )}

          <button
            onClick={onLeaveGame}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
          >
            Leave Game
          </button>
        </div>
      </div>
    );
  };

  // Tournament Game Component
  const TournamentGame = ({ game, userId, handlemakemove, onLeaveGame }) => {
    if (!game) return <p className="text-white">Loading game...</p>;

    const playersArray = Object.values(game.players || {});
    const currentPlayer = game.players[userId];
    const opponent = playersArray.find(p => p.id !== userId) || playersArray.find(p => p.name !== currentPlayer?.name); // Fallback for opponent
    const opponentId = Object.keys(game.players).find(id => id !== userId);

    const isCurrentPlayerChosen = currentPlayer?.pendingChoice !== null && currentPlayer?.pendingChoice !== undefined;
    const isRoundResolved = (opponent?.choice !== null && opponent?.choice !== undefined) && (currentPlayer?.choice !== null && currentPlayer?.choice !== undefined);


    const playerMoveDisplay = (player) => {
      // If round is resolved, show the actual choice.
      if (isRoundResolved) {
        return player?.choice || 'N/A';
      }
      // If player is current user and has chosen, show "Chosen!"
      if (player.id === userId && player.pendingChoice) {
        return 'Chosen!';
      }
      // If opponent, and round not resolved, show "Waiting..." or "Not Chosen"
      if (player.id !== userId) {
          if (player.pendingChoice) {
              return 'Waiting for reveal...'; // Opponent has chosen, but not revealed yet
          }
          return 'Not Chosen'; // Opponent hasn't chosen yet
      }
      return 'Not Chosen'; // Current player hasn't chosen yet
    };


    const getWinnerMessage = (round) => {
      const historyEntry = game.history.find(entry => entry.round === round);
      if (historyEntry) {
        if (historyEntry.winner === 'Tie') {
          return "It's a tie!";
        }
        return `${historyEntry.winner} won Round ${round}!`;
      }
      return "Round not yet played.";
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg max-w-4xl w-full text-center">
          <h2 className="text-4xl font-bold mb-4 text-purple-400">{game.name}</h2>
          <p className="text-xl mb-6">Round {game.currentRound} of {game.rounds}</p>

          {/* Player Scores */}
          <div className="flex justify-around mb-8">
            {playersArray.map(player => (
              <div key={player.id} className="flex flex-col items-center">
                <span className="text-2xl font-semibold">{player.name} {player.id === userId && '(You)'}</span>
                <span className="text-5xl font-extrabold text-blue-400">{game.scores[player.id] || 0}</span>
              </div>
            ))}
          </div>

          {/* Current Round Status / Choices */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold mb-4 text-gray-300">Your Move:</h3>
            <div className="flex justify-center space-x-4 mb-6">
              {['rock', 'paper', 'scissors'].map(move => (
                <button
                  key={move}
                  onClick={() => handlemakemove(move)}
                  disabled={isCurrentPlayerChosen} // Disable after player has made a choice
                  className={`px-6 py-3 rounded-lg text-xl font-bold transition duration-300 transform hover:scale-105
                    ${isCurrentPlayerChosen ? 'bg-gray-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {move.charAt(0).toUpperCase() + move.slice(1)}
                </button>
              ))}
            </div>

            <p className="text-xl">
              Your Choice: <span className="font-bold">{playerMoveDisplay(currentPlayer)}</span>
            </p>
            <p className="text-xl">
              Opponent's Choice ({opponent?.name || 'Waiting'}): <span className="font-bold">{playerMoveDisplay(opponent)}</span>
            </p>

            {isCurrentPlayerChosen && !isRoundResolved && (
              <p className="text-yellow-400 mt-4">Waiting for opponent to make a move...</p>
            )}
            {isRoundResolved && (
              <p className="text-green-400 mt-4 text-2xl font-semibold">{getWinnerMessage(game.currentRound - 1)}</p>
            )}
          </div>

          {/* Round History (Optional - for debugging/review) */}
          {game.history && game.history.length > 0 && (
            <div className="mt-8 bg-gray-700 p-6 rounded-lg">
              <h3 className="text-2xl font-semibold mb-4 text-gray-300">Game History:</h3>
              <div className="space-y-4 text-left">
                {game.history.map((entry, index) => (
                  <div key={index} className="border-b border-gray-600 pb-4 last:border-b-0">
                    <p className="text-xl font-bold">Round {entry.round}:</p>
                    {Object.values(entry.players).map(p => (
                      <p key={p.name} className="text-lg ml-4">- {p.name} chose: <span className="font-semibold">{p.choice}</span></p>
                    ))}
                    <p className="text-xl font-semibold mt-2">Winner: {entry.winner}</p>
                    <p className="text-sm text-gray-400">Scores: {Object.entries(entry.scores).map(([pId, score]) => `${game.players[pId]?.name || pId}: ${score}`).join(', ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onLeaveGame}
            className="mt-8 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
          >
            Leave Game
          </button>
        </div>
      </div>
    );
  };

  // Game Ended Modal Component
  const GameEndedModal = ({ game, onRestartGame, onLeaveGame }) => {
    if (game?.status !== 'ended') return null; // Only show if game has ended

    const winnerName = game.winner === 'Tie' ? 'It\'s a Tie!' : (game.players[game.winner]?.name || 'Unknown Winner');

    return (
      <div
        id="gameEndedModal" // Used for direct DOM manipulation fallback in resolveRound
        className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50"
      >
        <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full text-center border-2 border-green-500">
          <h2 className="text-4xl font-bold mb-4 text-green-400">Game Over!</h2>
          <p className="text-2xl mb-6">Winner: <span className="font-extrabold">{winnerName}</span></p>
          <div className="space-y-4">
            {game.players[userId]?.host && (
              <button
                onClick={onRestartGame}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
              >
                Restart Game
              </button>
            )}
            <button
              onClick={onLeaveGame}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 transform hover:scale-105"
            >
              Leave Game
            </button>
          </div>
        </div>
      </div>
    );
  };


  // Main render logic for App component
  // Provide all necessary state and setters via FirebaseContext
  return (
    <FirebaseContext.Provider value={{
      db, auth, userId, setUserId, displayName, setDisplayName,
      isAuthReady, appId,
      currentGameId, setCurrentGameId, game, setGame, currentPage, setCurrentPage
    }}>
      <div className="min-h-screen bg-gray-900 text-white font-inter">
        {currentPage === 'home' && (
          <HomePage
            onShowCreateGame={() => setCurrentPage('create')}
            onShowJoinGame={() => setCurrentPage('join')}
            userId={userId}
          />
        )}

        {currentPage === 'create' && (
          <CreateGame
            onCreateGame={createGame}
            onBack={() => setCurrentPage('home')}
          />
        )}

        {currentPage === 'join' && (
          <JoinGame
            onJoinGame={joinGame}
            onBack={() => setCurrentPage('home')}
          />
        )}

        {currentPage === 'lobby' && (
          <GameLobby
            game={game}
            currentGameId={currentGameId}
            userId={userId}
            onStartGame={handleStartGame}
            onLeaveGame={handleLeaveGame}
          />
        )}

        {currentPage === 'game' && (
          <TournamentGame
            game={game}
            userId={userId}
            handlemakemove={handlemakemove}
            onLeaveGame={handleLeaveGame}
          />
        )}

        {/* This modal is displayed conditionally based on game.status */}
        {game?.status === 'ended' && (
          <GameEndedModal
            game={game}
            onRestartGame={handleRestartGame}
            onLeaveGame={handleLeaveGame}
          />
        )}
      </div>
    </FirebaseContext.Provider>
  );
};

export default App;
