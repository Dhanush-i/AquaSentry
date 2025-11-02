import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from '@expo/vector-icons';

const API_BASE_URL = 'http://172.20.217.25:5000'; // <-- MAKE SURE THIS IS YOUR IP

const COLORS = {
  primary: '#005A9C',
  lightBg: '#f8f9fa',
  white: '#fff',
  textDark: '#212529',
  textLight: '#6c757d',
  border: '#dee2e6',
  danger: '#dc3545',
  status: {
    new: '#0d6efd',
    verified: '#198754',
    action: '#ffc107',
    false: '#6c757d',
  }
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [activeAppTab, setActiveAppTab] = useState('newReport'); 

  const [authProps, setAuthProps] = useState({
    username: '',
    password: '',
    activeTab: 'login',
  });
  
  const [reportProps, setReportProps] = useState({
    description: '',
    imageUri: null,
    location: null,
    isSubmitting: false,
    isConnected: true,
  });

  const [myReportsProps, setMyReportsProps] = useState({
    reports: [],
    isLoading: false,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected && state.isInternetReachable;
      setReportProps(prev => ({...prev, isConnected: connected}));
      if (connected) {
        syncOfflineReports();
      }
    });
    return () => unsubscribe();
  }, [isLoggedIn]);

  const handleAuthChange = (key, value) => {
    setAuthProps(prev => ({ ...prev, [key]: value }));
  };

  const handleReportChange = (key, value) => {
    setReportProps(prev => ({ ...prev, [key]: value }));
  };

  const handleMyReportsChange = (key, value) => {
    setMyReportsProps(prev => ({ ...prev, [key]: value }));
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    setAuthProps({ username: '', password: '', activeTab: 'login' });
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setIsLoggedIn(false);
      setCurrentUser(null);
      setReportProps({ description: '', imageUri: null, location: null, isSubmitting: false, isConnected: reportProps.isConnected });
      setMyReportsProps({ reports: [], isLoading: false });
    }
  };

  const syncOfflineReports = async () => {
    try {
      let offlineQueue = await AsyncStorage.getItem('offlineReports');
      offlineQueue = offlineQueue ? JSON.parse(offlineQueue) : [];
      
      if (offlineQueue.length === 0) return;
      
      Alert.alert('Syncing...', `Attempting to upload ${offlineQueue.length} saved report(s).`);

      let failed = 0;
      const remainingReports = [];

      for (const reportData of offlineQueue) {
        const formData = new FormData();
        formData.append('description', reportData.description);
        formData.append('latitude', reportData.latitude);
        formData.append('longitude', reportData.longitude);

        if (reportData.imageUri) {
          let localUri = reportData.imageUri;
          let filename = localUri.split('/').pop();
          
          let match = /\.(\w+)$/.exec(filename);
          let type = match ? `image/${match[1]}` : `image`;

          const fileData = {
            uri: localUri,
            name: filename,
            type: type,
          };
          
          formData.append('image', fileData);
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/reports`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Sync failed');
        } catch (e) {
          failed++;
          remainingReports.push(reportData);
          console.error('Failed to sync report:', e);
        }
      }

      await AsyncStorage.setItem('offlineReports', JSON.stringify(remainingReports));
      if (failed > 0) {
        Alert.alert('Sync Incomplete', `${failed} report(s) could not be uploaded. They will be retried later.`);
      } else {
        Alert.alert('Sync Complete!', 'All offline reports have been uploaded.');
      }
    } catch (e) {
      console.error('Error during sync:', e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {!isLoggedIn ? (
        <AuthScreen 
          authProps={authProps} 
          onAuthChange={handleAuthChange} 
          onLoginSuccess={handleLoginSuccess}
        />
      ) : (
        <View style={{flex: 1}}>
          {!reportProps.isConnected && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>Offline Mode: Reports will be saved locally</Text>
            </View>
          )}

          <View style={styles.appNavBar}>
            <TabButton
              title="New Report"
              icon="add-circle"
              isActive={activeAppTab === 'newReport'}
              onPress={() => setActiveAppTab('newReport')}
            />
            <TabButton
              title="My Reports"
              icon="list"
              isActive={activeAppTab === 'myReports'}
              onPress={() => setActiveAppTab('myReports')}
            />
          </View>
          
          <View style={{flex: 1}}>
            {activeAppTab === 'newReport' ? (
              <NewReportScreen
                reportProps={reportProps}
                onReportChange={handleReportChange}
                onLogout={handleLogout}
                syncOfflineReports={syncOfflineReports}
                setActiveAppTab={setActiveAppTab}
              />
            ) : (
              <MyReportsScreen
                myReportsProps={myReportsProps}
                onMyReportsChange={handleMyReportsChange}
                onLogout={handleLogout}
              />
            )}
          </View>
          
        </View>
      )}
    </SafeAreaView>
  );
}

const TabButton = ({ title, icon, isActive, onPress }) => (
  <TouchableOpacity
    style={[styles.appNavButton, isActive && styles.appNavButtonActive]}
    onPress={onPress}
  >
    <Ionicons name={icon} size={24} color={isActive ? COLORS.primary : COLORS.textLight} />
    <Text style={[styles.appNavText, isActive && styles.appNavTextActive]}>{title}</Text>
  </TouchableOpacity>
);

const AuthScreen = ({ authProps, onAuthChange, onLoginSuccess }) => {
  const { username, password, activeTab } = authProps;

  const handleRegister = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Username and password cannot be empty.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success!', 'Registration successful. Please log in.');
        onAuthChange('activeTab', 'login');
      } else {
        Alert.alert('Registration Failed', data.error || 'Please try again.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network Error', 'Could not connect to the server.');
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Username and password cannot be empty.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        onLoginSuccess(data);
      } else {
        Alert.alert('Login Failed', data.error || 'Invalid username or password.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network Error', 'Could not connect to the server.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.authContainer}>
      <Image 
        source={{ uri: 'https://placehold.co/100x100/005A9C/white?text=AS' }} 
        style={styles.logo}
      />
      <Text style={styles.title}>AquaSentry</Text>
      
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'login' && styles.tabActive]}
          onPress={() => onAuthChange('activeTab', 'login')}
        >
          <Text style={[styles.tabText, activeTab === 'login' && styles.tabTextActive]}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'register' && styles.tabActive]}
          onPress={() => onAuthChange('activeTab', 'register')}
        >
          <Text style={[styles.tabText, activeTab === 'register' && styles.tabTextActive]}>Register</Text>
        </TouchableOpacity>
      </View>
      
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={(text) => onAuthChange('username', text)}
        autoCapitalize="none"
        placeholderTextColor={COLORS.textLight}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={(text) => onAuthChange('password', text)}
        secureTextEntry
        placeholderTextColor={COLORS.textLight}
      />
      
      <TouchableOpacity
        style={styles.button}
        onPress={activeTab === 'login' ? handleLogin : handleRegister}
      >
        <Text style={styles.buttonText}>
          {activeTab === 'login' ? 'Login' : 'Register'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const NewReportScreen = ({ reportProps, onReportChange, onLogout, syncOfflineReports, setActiveAppTab }) => {
  const { description, imageUri, location, isSubmitting, isConnected } = reportProps;

  const handleGetLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Permission to access location was denied.');
      return;
    }
    try {
      let locationData = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      onReportChange('location', locationData.coords);
      Alert.alert('Location Acquired!', 'Your GPS location has been set.');
    } catch (error) {
      Alert.alert('Error', 'Could not get location. Please try again.');
    }
  };

  const handlePickImage = async () => {
    let { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Permission to access photo library was denied.');
      return;
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      onReportChange('imageUri', result.assets[0].uri);
    }
  };

  const handleSubmitReport = async () => {
    if (!description || !location) {
      Alert.alert('Missing Info', 'Please provide a description and get your location.');
      return;
    }
    onReportChange('isSubmitting', true);

    const reportData = {
      description,
      latitude: location.latitude,
      longitude: location.longitude,
      imageUri: imageUri,
    };

    if (!isConnected) {
      try {
        let offlineQueue = await AsyncStorage.getItem('offlineReports');
        offlineQueue = offlineQueue ? JSON.parse(offlineQueue) : [];
        offlineQueue.push(reportData);
        await AsyncStorage.setItem('offlineReports', JSON.stringify(offlineQueue));
        Alert.alert('Offline Mode', 'Report saved locally. It will be uploaded when you are back online.');
        onReportChange('description', '');
        onReportChange('imageUri', null);
        onReportChange('location', null);
      } catch (e) {
        Alert.alert('Error', 'Failed to save report locally.');
      } finally {
        onReportChange('isSubmitting', false);
      }
      return;
    }

    const formData = new FormData();
    formData.append('description', description);
    formData.append('latitude', location.latitude);
    formData.append('longitude', location.longitude);

    if (imageUri) {
      let localUri = imageUri;
      let filename = localUri.split('/').pop();
      let match = /\.(\w+)$/.exec(filename);
      let type = match ? `image/${match[1]}` : `image`;
      
      const fileData = {
        uri: localUri,
        name: filename,
        type: type,
      };
      
      formData.append('image', fileData);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) {
          Alert.alert('Session Expired', 'Please log in again.');
          onLogout();
          return;
        }
        throw new Error('Server could not save the report.');
      }
      await response.json();
      Alert.alert('Success!', 'Report submitted successfully!');
      onReportChange('description', '');
      onReportChange('imageUri', null);
      onReportChange('location', null);
      syncOfflineReports();
      setActiveAppTab('myReports');
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      onReportChange('isSubmitting', false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.welcomeTitle}>New Hazard Report</Text>
        <TouchableOpacity onPress={onLogout}>
          <Ionicons name="log-out-outline" size={28} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        placeholder="Describe the hazard (e.g., high waves, flooding)..."
        value={description}
        onChangeText={(text) => onReportChange('description', text)}
        multiline
        placeholderTextColor={COLORS.textLight}
      />
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={handlePickImage}>
          <Ionicons name="image-outline" size={20} color={COLORS.primary} style={{marginRight: 8}} />
          <Text style={styles.actionButtonText}>
            {imageUri ? 'Change Photo' : 'Add Photo'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleGetLocation}>
          <Ionicons name="location-outline" size={20} color={COLORS.primary} style={{marginRight: 8}} />
          <Text style={styles.actionButtonText}>
            {location ? 'Refresh Location' : 'Get Location'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statusRow}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.thumbnail} />}
        {location && (
          <Text style={styles.statusText}>
            Location: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSubmitReport}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Submit Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const MyReportsScreen = ({ myReportsProps, onMyReportsChange, onLogout }) => {
  const { reports, isLoading } = myReportsProps;

  const fetchMyReports = async () => {
    onMyReportsChange('isLoading', true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/my-reports`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401) onLogout();
        throw new Error('Could not fetch reports');
      }
      const data = await response.json();
      onMyReportsChange('reports', data);
    } catch (error) {
      console.error('Fetch reports error:', error);
      Alert.alert('Error', 'Could not load your reports.');
    } finally {
      onMyReportsChange('isLoading', false);
    }
  };

  useEffect(() => {
    fetchMyReports();
  }, []);

  const getStatusStyle = (status) => {
    if (status === 'verified') return styles.statusVerified;
    if (status === 'action_taken') return styles.statusAction;
    if (status === 'false_alarm') return styles.statusFalse;
    return styles.statusNew;
  };

  const renderReportItem = ({ item }) => (
    <View style={styles.reportItem}>
      <Text style={styles.reportDescription}>{item.description}</Text>
      <Text style={styles.reportTimestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
      <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
        <Text style={styles.statusBadgeText}>{item.status.replace('_', ' ')}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.welcomeTitle}>My Submitted Reports</Text>
        <TouchableOpacity onPress={onLogout}>
          <Ionicons name="log-out-outline" size={28} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id.toString()}
        style={styles.reportList}
        ListEmptyComponent={<Text style={styles.noReportsText}>You have not submitted any reports yet.</Text>}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={fetchMyReports} />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? 25 : 0 
  },
  offlineBanner: { 
    padding: 10, 
    backgroundColor: COLORS.status.action, 
    alignItems: 'center' 
  },
  offlineBannerText: { 
    color: COLORS.textDark, 
    fontWeight: 'bold' 
  },
  authContainer: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    padding: 24,
    backgroundColor: COLORS.white,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 32,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: COLORS.lightBg,
    borderRadius: 8,
  },
  tab: { 
    flex: 1, 
    paddingVertical: 14, 
    borderRadius: 8 
  },
  tabActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  tabText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  tabTextActive: { 
    color: COLORS.primary 
  },
  input: {
    backgroundColor: COLORS.lightBg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textDark,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { 
    backgroundColor: '#a0cfff' 
  },
  buttonText: { 
    color: COLORS.white, 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  
  formContainer: { 
    flex: 1, 
    padding: 24, 
    backgroundColor: COLORS.white 
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: COLORS.textDark 
  },
  logoutButtonText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: COLORS.danger 
  },
  descriptionInput: { 
    height: 100, 
    textAlignVertical: 'top' 
  },
  actionRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 16 
  },
  actionButton: {
    backgroundColor: COLORS.lightBg,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  actionButtonText: { 
    color: COLORS.primary, 
    fontSize: 15, 
    fontWeight: '600' 
  },
  statusRow: { 
    alignItems: 'center', 
    marginBottom: 16,
    padding: 10,
  },
  thumbnail: { 
    width: 100, 
    height: 100, 
    borderRadius: 8, 
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusText: { 
    fontSize: 14, 
    color: COLORS.textLight 
  },
  
  appNavBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  appNavButton: { 
    flex: 1, 
    paddingVertical: 15, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  appNavButtonActive: { 
    borderBottomColor: COLORS.primary,
  },
  appNavText: { 
    color: COLORS.textLight, 
    fontSize: 12, 
    fontWeight: '500',
    marginTop: 4,
  },
  appNavTextActive: { 
    color: COLORS.primary, 
    fontWeight: '600' 
  },
  
  reportList: { 
    flex: 1, 
    marginTop: 16 
  },
  reportItem: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reportDescription: { 
    fontSize: 16, 
    fontWeight: '500', 
    color: COLORS.textDark, 
    marginBottom: 8 
  },
  reportTimestamp: { 
    fontSize: 12, 
    color: COLORS.textLight, 
    marginBottom: 10 
  },
  noReportsText: { 
    textAlign: 'center', 
    marginTop: 32, 
    fontSize: 16, 
    color: COLORS.textLight 
  },
  
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { 
    color: '#fff', 
    fontSize: 12, 
    fontWeight: 'bold', 
    textTransform: 'capitalize' 
  },
  statusNew: { backgroundColor: COLORS.status.new },
  statusVerified: { backgroundColor: COLORS.status.verified },
  statusAction: { backgroundColor: COLORS.status.action, color: COLORS.textDark },
  statusFalse: { backgroundColor: COLORS.status.false },
});

