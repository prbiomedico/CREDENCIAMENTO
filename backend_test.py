#!/usr/bin/env python3
"""
Backend API Testing for SIGCR System
Tests all main endpoints including auth, companies, portarias, documents, and stats
"""

import requests
import sys
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional

class SIGCRAPITester:
    def __init__(self, base_url: str = "https://registro-oficial-br.preview.emergentagent.com", 
                 session_token: str = "test_session_1773680545064"):
        self.base_url = base_url
        self.api_base = f"{base_url}/api"
        self.session_token = session_token
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict[Any, Any]] = None, auth: bool = True) -> tuple[bool, Dict[Any, Any]]:
        """Run a single API test"""
        url = f"{self.api_base}/{endpoint.lstrip('/')}"
        headers = {'Content-Type': 'application/json'}
        
        if auth and self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'

        self.tests_run += 1
        print(f"\n🔍 [{self.tests_run}] Testing {name}...")
        print(f"    URL: {url}")
        print(f"    Method: {method}")
        print(f"    Auth: {'Yes' if auth else 'No'}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            
            try:
                response_data = response.json() if response.content else {}
            except:
                response_data = {'raw_text': response.text}

            test_result = {
                'name': name,
                'method': method,
                'endpoint': endpoint,
                'expected_status': expected_status,
                'actual_status': response.status_code,
                'success': success,
                'response_data': response_data
            }
            
            self.test_results.append(test_result)

            if success:
                self.tests_passed += 1
                print(f"    ✅ PASSED - Status: {response.status_code}")
                if response_data:
                    print(f"    📄 Response: {json.dumps(response_data, indent=2)[:200]}...")
            else:
                print(f"    ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                print(f"    📄 Response: {json.dumps(response_data, indent=2)[:500]}...")

            return success, response_data

        except Exception as e:
            print(f"    💥 ERROR - {str(e)}")
            test_result = {
                'name': name,
                'method': method,
                'endpoint': endpoint,
                'expected_status': expected_status,
                'actual_status': 'ERROR',
                'success': False,
                'error': str(e)
            }
            self.test_results.append(test_result)
            return False, {}

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n" + "="*80)
        print("🔐 TESTING AUTHENTICATION ENDPOINTS")
        print("="*80)
        
        # Test /auth/me with valid token
        success, user_data = self.run_test(
            "Get Current User (/auth/me)",
            "GET",
            "/auth/me",
            200
        )
        
        if success:
            self.user_data = user_data
            print(f"    👤 Logged in as: {user_data.get('name', 'Unknown')} ({user_data.get('email', 'No email')})")
        
        return success

    def test_stats_endpoint(self):
        """Test dashboard statistics endpoint"""
        print("\n" + "="*80)
        print("📊 TESTING DASHBOARD STATS")
        print("="*80)
        
        success, stats_data = self.run_test(
            "Get Dashboard Stats (/stats)",
            "GET",
            "/stats",
            200
        )
        
        if success:
            stats = stats_data
            print(f"    📈 Companies: {stats.get('total_companies', 0)} (Pending: {stats.get('pending_companies', 0)}, Approved: {stats.get('approved_companies', 0)})")
            print(f"    📜 Portarias: {stats.get('total_portarias', 0)}")
        
        return success

    def test_company_endpoints(self):
        """Test company CRUD operations"""
        print("\n" + "="*80)
        print("🏢 TESTING COMPANY ENDPOINTS")
        print("="*80)
        
        # Get companies
        success, companies_data = self.run_test(
            "Get Companies (/companies)",
            "GET",
            "/companies",
            200
        )
        
        # Create a new company
        test_company = {
            "name": f"Empresa Teste SIGCR {datetime.now().strftime('%H%M%S')}",
            "cnpj": "12.345.678/0001-90"
        }
        
        create_success, created_company = self.run_test(
            "Create Company (/companies)",
            "POST",
            "/companies",
            200,
            data=test_company
        )
        
        company_id = None
        if create_success and created_company:
            company_id = created_company.get('company_id')
            print(f"    🆕 Created company ID: {company_id}")
        
        # Get specific company
        if company_id:
            self.run_test(
                f"Get Company by ID (/companies/{company_id})",
                "GET",
                f"/companies/{company_id}",
                200
            )
            
            # Update company status
            self.run_test(
                f"Update Company Status",
                "PATCH",
                f"/companies/{company_id}/status?status=approved",
                200
            )
        
        return success and create_success, company_id

    def test_portarias_endpoints(self, test_company_id: Optional[str] = None):
        """Test portarias CRUD and AI analysis"""
        print("\n" + "="*80)
        print("📜 TESTING PORTARIAS ENDPOINTS")
        print("="*80)
        
        # Get all portarias
        success, portarias_data = self.run_test(
            "Get Portarias (/portarias)",
            "GET",
            "/portarias",
            200
        )
        
        # Create a test portaria
        test_portaria = {
            "title": f"Portaria Teste DETRAN-SP {datetime.now().strftime('%H:%M:%S')}",
            "content": "PORTARIA Nº 123/2026 - O Diretor do DETRAN-SP, no uso de suas atribuições legais, RESOLVE: Art. 1º Credenciar a empresa Teste Registradora LTDA para realizar o registro de contratos de financiamento de veículos.",
            "source": "DOSP",
            "date": datetime.now(timezone.utc).isoformat(),
            "detran": "SP"
        }
        
        create_success, created_portaria = self.run_test(
            "Create Portaria (/portarias)",
            "POST",
            "/portarias",
            200,
            data=test_portaria
        )
        
        portaria_id = None
        if create_success and created_portaria:
            portaria_id = created_portaria.get('portaria_id')
            print(f"    📋 Created portaria ID: {portaria_id}")
        
        # Test search
        search_success, search_results = self.run_test(
            "Search Portarias (/portarias/search)",
            "GET",
            "/portarias/search?q=DETRAN",
            200
        )
        
        # Test AI analysis (this might be slower)
        analyze_text = "PORTARIA Nº 456/2026 - DETRAN-RJ - Credencia a Empresa ABC Registradora LTDA para realizar registro de contratos de financiamento de veículos automotores."
        
        print("    🤖 Testing AI Analysis (GPT-5.2) - This may take a few seconds...")
        analyze_success, analysis_result = self.run_test(
            "Analyze Portaria with AI (/portarias/analyze)",
            "POST",
            "/portarias/analyze",
            200,
            data={"text": analyze_text}
        )
        
        if analyze_success and analysis_result:
            print(f"    🎯 AI Analysis result: {json.dumps(analysis_result, indent=2)[:300]}...")
        
        return success and create_success, portaria_id

    def test_document_endpoints(self, test_company_id: Optional[str] = None):
        """Test document operations"""
        print("\n" + "="*80)
        print("📄 TESTING DOCUMENT ENDPOINTS")
        print("="*80)
        
        if not test_company_id:
            print("    ⚠️  Skipping document tests - no company ID available")
            return False, None
        
        # Get documents for company
        success, documents_data = self.run_test(
            f"Get Documents for Company (/documents/{test_company_id})",
            "GET",
            f"/documents/{test_company_id}",
            200
        )
        
        return success, None

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting SIGCR Backend API Testing...")
        print(f"🔗 Base URL: {self.base_url}")
        print(f"🎫 Session Token: {self.session_token[:20]}...")
        
        # Test authentication first
        auth_success = self.test_auth_endpoints()
        if not auth_success:
            print("\n❌ Authentication failed - stopping tests")
            return False
        
        # Test stats
        stats_success = self.test_stats_endpoint()
        
        # Test company operations
        company_success, company_id = self.test_company_endpoints()
        
        # Test portarias
        portarias_success, portaria_id = self.test_portarias_endpoints(company_id)
        
        # Test documents
        doc_success, doc_id = self.test_document_endpoints(company_id)
        
        # Final summary
        print("\n" + "="*80)
        print("📈 FINAL TEST RESULTS")
        print("="*80)
        print(f"🧪 Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_run - self.tests_passed}")
        print(f"📊 Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Categorize results
        failed_tests = [test for test in self.test_results if not test['success']]
        if failed_tests:
            print(f"\n🔍 Failed Tests Details:")
            for test in failed_tests:
                print(f"  ❌ {test['name']} - Expected {test['expected_status']}, got {test['actual_status']}")
        
        success_rate = self.tests_passed / self.tests_run
        overall_success = success_rate >= 0.8  # 80% success rate threshold
        
        return overall_success

def main():
    """Main test runner"""
    tester = SIGCRAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n🛑 Testing interrupted by user")
        return 1
    except Exception as e:
        print(f"\n💥 Unexpected error during testing: {str(e)}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    print(f"\n🏁 Testing completed with exit code: {exit_code}")
    sys.exit(exit_code)