from glob import glob
from setuptools import setup

package_name = 'jubjub_claude'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.py')),
        ('share/' + package_name + '/config', glob('config/*.yaml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='hurwan',
    maintainer_email='hurwan@example.com',
    description='JUBJUB sandboxed robot pipeline',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'trash_detector = jubjub_claude.trash_detector:main',
            'trash_tracker = jubjub_claude.trash_tracker:main',
            'nav_adapter = jubjub_claude.nav_adapter:main',
            'jubjub_manager = jubjub_claude.jubjub_manager:main',
            'server_bridge = jubjub_claude.server_bridge:main',
            'arm_ik = jubjub_claude.arm_ik:main',
            'geo_localizer = jubjub_claude.geo_localizer:main',
            'sandbox_guard = jubjub_claude.sandbox_guard:main',
            'mock_server = jubjub_claude.mock_server:main',
            'fake_gps = jubjub_claude.fake_gps:main',
            'synthetic_detections = jubjub_claude.synthetic_detections:main',
        ],
    },
)
